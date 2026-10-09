import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise'
import { DRIZZLE_MIGRATION_MANIFEST } from './migration-manifest.generated'
import { resolveOperationsReleaseIdentity, type OperationsReleaseIdentity } from './release'

export type MigrationLedgerRow = { hash: unknown, created_at: unknown }

export type MigrationLedgerAssessment = {
  status: 'exact' | 'mismatch'
  reasonCode: string | null
  expectedCount: number
  observedCount: number
  expectedLatestTag: string
  expectedLatestCreatedAt: number
  observedLatestCreatedAt: number | null
  mismatchIndex: number | null
  mismatchTag: string | null
}

export type DatabaseProbeEvidence =
  | { kind: 'ok', ledgerRows: MigrationLedgerRow[] }
  | { kind: 'not_configured' }

export type RuntimeReadiness = {
  status: 'ready' | 'not_ready'
  release: OperationsReleaseIdentity
  checkedAt: string
  durationMs: number
  timeoutMs: number
  releaseCheck: { status: 'pass' | 'fail', reasonCode: string | null }
  database: { status: 'pass' | 'fail', reasonCode: string | null }
  migrations: MigrationLedgerAssessment | { status: 'not_checked', reasonCode: string }
}

const DEFAULT_TIMEOUT_MS = 2_000
const MIN_TIMEOUT_MS = 250
const MAX_TIMEOUT_MS = 5_000

class ReadinessTimeoutError extends Error {}

function destroyConnection(connection: Connection | null) {
  if (connection) connection.destroy()
}

function configuredTimeout(environment: Record<string, string | undefined>): number {
  const parsed = Number(environment.NUXT_OPERATIONS_READINESS_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(parsed)))
}

function normalizeCreatedAt(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const numberValue = Number(value)
    return Number.isSafeInteger(numberValue) ? numberValue : null
  }
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) ? numberValue : null
}

export function assessMigrationLedger(rows: readonly MigrationLedgerRow[]): MigrationLedgerAssessment {
  const expected = DRIZZLE_MIGRATION_MANIFEST
  const expectedLatest = expected[expected.length - 1]!
  const observedLatestCreatedAt = rows.length ? normalizeCreatedAt(rows[rows.length - 1]?.created_at) : null
  const base = {
    expectedCount: expected.length,
    observedCount: rows.length,
    expectedLatestTag: expectedLatest.tag,
    expectedLatestCreatedAt: expectedLatest.createdAt,
    observedLatestCreatedAt,
  }

  if (rows.length !== expected.length) {
    const mismatchIndex = Math.min(rows.length, expected.length)
    return {
      ...base,
      status: 'mismatch',
      reasonCode: 'MIGRATION_COUNT_MISMATCH',
      mismatchIndex,
      mismatchTag: expected[mismatchIndex]?.tag || null,
    }
  }

  for (let index = 0; index < expected.length; index += 1) {
    const expectedMigration = expected[index]!
    const row = rows[index]!
    const createdAt = normalizeCreatedAt(row.created_at)
    if (createdAt !== expectedMigration.createdAt) {
      return { ...base, status: 'mismatch', reasonCode: 'MIGRATION_CREATED_AT_MISMATCH', mismatchIndex: index, mismatchTag: expectedMigration.tag }
    }
    if (typeof row.hash !== 'string' || row.hash !== expectedMigration.hash) {
      return { ...base, status: 'mismatch', reasonCode: 'MIGRATION_HASH_MISMATCH', mismatchIndex: index, mismatchTag: expectedMigration.tag }
    }
  }

  return { ...base, status: 'exact', reasonCode: null, mismatchIndex: null, mismatchTag: null }
}

/** Explicit runtime probe. Importing this module never opens a DB connection. */
export async function readDatabaseProbeEvidence(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DatabaseProbeEvidence> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return { kind: 'not_configured' }

  let connection: Connection | null = null
  let cancelled = false
  const url = new URL(databaseUrl)
  url.searchParams.set('connectTimeout', String(timeoutMs))
  const connecting = mysql.createConnection(url.toString()).then((created) => {
    connection = created
    if (cancelled) created.destroy()
    return created
  })

  try {
    return await withTimeout(async () => {
      const active = await connecting
      const [healthRows] = await active.query<RowDataPacket[]>({ sql: 'SELECT 1 AS healthy', timeout: timeoutMs })
      if (Number(healthRows[0]?.healthy) !== 1) throw new Error('DATABASE_HEALTH_RESULT_INVALID')
      const [ledgerRows] = await active.query<RowDataPacket[]>({
        sql: 'SELECT hash, created_at FROM `__drizzle_migrations` ORDER BY created_at ASC, id ASC',
        timeout: timeoutMs,
      })
      return { kind: 'ok' as const, ledgerRows: ledgerRows as unknown as MigrationLedgerRow[] }
    }, timeoutMs, () => {
      cancelled = true
      destroyConnection(connection)
    })
  } finally {
    cancelled = true
    destroyConnection(connection)
  }
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout?.()
      reject(new ReadinessTimeoutError('READINESS_TIMEOUT'))
    }, timeoutMs)
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  })
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function evaluateRuntimeReadiness(options: {
  probe?: () => Promise<DatabaseProbeEvidence>
  timeoutMs?: number
  environment?: Record<string, string | undefined>
  now?: () => Date
  release?: OperationsReleaseIdentity
} = {}): Promise<RuntimeReadiness> {
  const now = options.now || (() => new Date())
  const checkedAt = now()
  const startedAtMs = Date.now()
  const timeoutMs = options.timeoutMs ?? configuredTimeout(options.environment || process.env)
  const release = options.release || resolveOperationsReleaseIdentity('', options.environment || process.env)
  const releaseCheck = release.commit
    ? { status: 'pass' as const, reasonCode: null }
    : { status: 'fail' as const, reasonCode: 'RELEASE_COMMIT_UNAVAILABLE' }
  const notChecked = (reasonCode: string): RuntimeReadiness => ({
    status: 'not_ready',
    release,
    checkedAt: checkedAt.toISOString(),
    durationMs: Math.max(0, Date.now() - startedAtMs),
    timeoutMs,
    releaseCheck,
    database: { status: 'fail', reasonCode },
    migrations: { status: 'not_checked', reasonCode },
  })

  try {
    const evidence = await withTimeout(
      options.probe || (() => readDatabaseProbeEvidence(timeoutMs)),
      timeoutMs,
    )
    if (evidence.kind === 'not_configured') return notChecked('DATABASE_NOT_CONFIGURED')
    const migrations = assessMigrationLedger(evidence.ledgerRows)
    return {
      status: migrations.status === 'exact' && releaseCheck.status === 'pass' ? 'ready' : 'not_ready',
      release,
      checkedAt: checkedAt.toISOString(),
      durationMs: Math.max(0, Date.now() - startedAtMs),
      timeoutMs,
      releaseCheck,
      database: { status: 'pass', reasonCode: null },
      migrations,
    }
  } catch (error) {
    return notChecked(error instanceof ReadinessTimeoutError ? 'DATABASE_CHECK_TIMEOUT' : 'DATABASE_QUERY_FAILED')
  }
}

export function sanitizePublicReadiness(readiness: RuntimeReadiness) {
  return {
    status: readiness.status,
    release: readiness.release,
    checkedAt: readiness.checkedAt,
    checks: {
      release: readiness.releaseCheck.status,
      database: readiness.database.status,
      migrations: readiness.migrations.status === 'exact' ? 'pass' : 'fail',
    },
  }
}

type ReadinessCache = { key: string, expiresAt: number, value: RuntimeReadiness }
type ReadinessRuntimeState = {
  cache: ReadinessCache | null
  inFlight: { key: string, promise: Promise<RuntimeReadiness> } | null
}
const READINESS_STATE_KEY = Symbol.for('discoverystack.operations.readiness.v1')
const readinessGlobal = globalThis as typeof globalThis & Record<symbol, unknown>
const readinessState = (readinessGlobal[READINESS_STATE_KEY] as ReadinessRuntimeState | undefined) || { cache: null, inFlight: null }
readinessGlobal[READINESS_STATE_KEY] = readinessState

export async function getCachedRuntimeReadiness(options: {
  release?: OperationsReleaseIdentity
  environment?: Record<string, string | undefined>
  nowMs?: () => number
  probe?: () => Promise<DatabaseProbeEvidence>
  timeoutMs?: number
} = {}): Promise<RuntimeReadiness> {
  const release = options.release || resolveOperationsReleaseIdentity('', options.environment || process.env)
  const key = `${release.marker}:${release.commit || 'missing'}`
  const nowMs = options.nowMs || Date.now
  const currentTime = nowMs()
  if (readinessState.cache?.key === key && readinessState.cache.expiresAt > currentTime) return readinessState.cache.value
  if (readinessState.inFlight?.key === key) return readinessState.inFlight.promise
  const promise = evaluateRuntimeReadiness({ release, environment: options.environment, probe: options.probe, timeoutMs: options.timeoutMs }).then((value) => {
    readinessState.cache = { key, value, expiresAt: nowMs() + (value.status === 'ready' ? 5_000 : 1_000) }
    return value
  }).finally(() => {
    if (readinessState.inFlight?.promise === promise) readinessState.inFlight = null
  })
  readinessState.inFlight = { key, promise }
  return promise
}

export function resetReadinessCacheForTests() {
  readinessState.cache = null
  readinessState.inFlight = null
}

export function livenessPayload(release: OperationsReleaseIdentity, now: Date = new Date()) {
  return { status: 'ok' as const, release, checkedAt: now.toISOString() }
}
