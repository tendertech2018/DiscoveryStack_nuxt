import mysql from 'mysql2/promise'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const growthTables = [
  'growthExperimentReviews',
  'growthExperimentVariants',
  'growthExperiments',
  'growthMeasurements',
  'growthResearchConsents',
  'growthResearchIntakes',
]
const migrationSql = await readFile(resolve(process.cwd(), 'server/database/migrations/0008_governed_growth_ledger.sql'), 'utf8')
const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the Growth Ledger migration preflight.')
}

const connection = await mysql.createConnection(process.env.DATABASE_URL)
try {
  const placeholders = growthTables.map(() => '?').join(', ')
  const [tables] = await connection.execute(
    `SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`,
    growthTables,
  )
  const [columns] = await connection.execute(
    "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'growthResearchConsent'",
  )
  const existingTables = new Set(tables.map((row) => row.tableName))
  const hasConsentColumn = columns.length === 1

  if (existingTables.size === growthTables.length && hasConsentColumn) {
    const [migrations] = await connection.execute(
      "SELECT hash FROM __drizzle_migrations WHERE hash = ? LIMIT 1",
      [migrationHash],
    )
    if (migrations.length !== 1) {
      throw new Error('Growth Ledger schema is present but migration history is missing. Refusing deployment to prevent drift.')
    }
    console.info(JSON.stringify({ event: 'growth_ledger_migration_preflight', state: 'already_migrated' }))
  } else if (existingTables.size === 0 && !hasConsentColumn) {
    throw new Error('Growth Ledger schema has not been migrated. Apply migration 0008_governed_growth_ledger.sql before deployment.')
  } else {
    throw new Error(`Growth Ledger schema is partial (tables=${existingTables.size}, consentColumn=${hasConsentColumn}). Refusing migration to prevent drift.`)
  }
} finally {
  await connection.end()
}
