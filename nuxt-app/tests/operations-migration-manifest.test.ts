import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DRIZZLE_MIGRATION_MANIFEST } from '../server/operations/migration-manifest.generated'

type Journal = { dialect: string, entries: Array<{ idx: number, when: number, tag: string }> }

describe('bundled Drizzle migration manifest', () => {
  it('exactly represents every journal entry and SQL byte hash', () => {
    const migrationDirectory = new URL('../server/database/migrations/', import.meta.url)
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', migrationDirectory), 'utf8')) as Journal
    expect(journal.dialect).toBe('mysql')
    expect(DRIZZLE_MIGRATION_MANIFEST).toHaveLength(journal.entries.length)

    const rebuilt = journal.entries.map(entry => ({
      index: entry.idx,
      tag: entry.tag,
      createdAt: entry.when,
      hash: createHash('sha256').update(readFileSync(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8')).digest('hex'),
    }))
    expect(DRIZZLE_MIGRATION_MANIFEST).toEqual(rebuilt)
  })
})
