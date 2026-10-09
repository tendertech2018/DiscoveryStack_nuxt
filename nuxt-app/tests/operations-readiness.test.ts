import { describe, expect, it, vi } from 'vitest'
import { DRIZZLE_MIGRATION_MANIFEST } from '../server/operations/migration-manifest.generated'
import {
  assessMigrationLedger,
  evaluateRuntimeReadiness,
  getCachedRuntimeReadiness,
  resetReadinessCacheForTests,
  sanitizePublicReadiness,
  type MigrationLedgerRow,
} from '../server/operations/readiness'
import { OPERATIONS_RELEASE_MARKER, resolveOperationsReleaseIdentity } from '../server/operations/release'

const release = { marker: OPERATIONS_RELEASE_MARKER, commit: 'a'.repeat(40) }
const exactRows = (): MigrationLedgerRow[] => DRIZZLE_MIGRATION_MANIFEST.map(migration => ({ hash: migration.hash, created_at: String(migration.createdAt) }))

describe('production runtime readiness', () => {
  it('requires the exact ordered Drizzle ledger, not only its latest timestamp', () => {
    expect(assessMigrationLedger(exactRows())).toMatchObject({ status: 'exact', expectedCount: 58, observedCount: 58 })
    const changed = exactRows()
    changed[12] = { ...changed[12]!, hash: '0'.repeat(64) }
    expect(assessMigrationLedger(changed)).toMatchObject({ status: 'mismatch', reasonCode: 'MIGRATION_HASH_MISMATCH', mismatchIndex: 12 })
    expect(assessMigrationLedger(changed.slice(0, -1))).toMatchObject({ status: 'mismatch', reasonCode: 'MIGRATION_COUNT_MISMATCH' })
  })

  it('is ready only with a source commit and exact read-only database evidence', async () => {
    const ready = await evaluateRuntimeReadiness({ release, probe: async () => ({ kind: 'ok', ledgerRows: exactRows() }) })
    expect(ready).toMatchObject({ status: 'ready', releaseCheck: { status: 'pass' }, database: { status: 'pass' }, migrations: { status: 'exact' } })
    expect(sanitizePublicReadiness(ready)).toEqual({
      status: 'ready',
      release,
      checkedAt: ready.checkedAt,
      checks: { release: 'pass', database: 'pass', migrations: 'pass' },
    })

    const unidentified = await evaluateRuntimeReadiness({ release: { ...release, commit: null }, probe: async () => ({ kind: 'ok', ledgerRows: exactRows() }) })
    expect(unidentified).toMatchObject({ status: 'not_ready', releaseCheck: { status: 'fail', reasonCode: 'RELEASE_COMMIT_UNAVAILABLE' }, database: { status: 'pass' } })
  })

  it('fails closed with sanitized reasons when DB is absent, throws, or exceeds its deadline', async () => {
    await expect(evaluateRuntimeReadiness({ release, probe: async () => ({ kind: 'not_configured' }) })).resolves.toMatchObject({
      status: 'not_ready', database: { status: 'fail', reasonCode: 'DATABASE_NOT_CONFIGURED' }, migrations: { status: 'not_checked' },
    })
    await expect(evaluateRuntimeReadiness({ release, probe: async () => { throw new Error('sensitive connection detail') } })).resolves.toMatchObject({
      status: 'not_ready', database: { reasonCode: 'DATABASE_QUERY_FAILED' },
    })
    const timeout = await evaluateRuntimeReadiness({ release, timeoutMs: 10, probe: () => new Promise(() => {}) })
    expect(timeout).toMatchObject({ status: 'not_ready', database: { reasonCode: 'DATABASE_CHECK_TIMEOUT' } })
    expect(JSON.stringify(timeout)).not.toContain('sensitive')
  })

  it('coalesces concurrent public probes and uses only a short result cache', async () => {
    resetReadinessCacheForTests()
    let complete!: (value: { kind: 'ok', ledgerRows: ReturnType<typeof exactRows> }) => void
    const probe = vi.fn(() => new Promise<{ kind: 'ok', ledgerRows: ReturnType<typeof exactRows> }>(resolve => { complete = resolve }))
    const first = getCachedRuntimeReadiness({ release, probe, nowMs: () => 1_000 })
    const second = getCachedRuntimeReadiness({ release, probe, nowMs: () => 1_000 })
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1))
    complete({ kind: 'ok', ledgerRows: exactRows() })
    expect(await first).toBe(await second)
    await getCachedRuntimeReadiness({ release, probe, nowMs: () => 5_999 })
    expect(probe).toHaveBeenCalledTimes(1)

    const freshProbe = vi.fn(async () => ({ kind: 'ok' as const, ledgerRows: exactRows() }))
    await getCachedRuntimeReadiness({ release, probe: freshProbe, nowMs: () => 6_001 })
    expect(freshProbe).toHaveBeenCalledTimes(1)
  })

  it('accepts only bounded hexadecimal release identifiers', () => {
    expect(resolveOperationsReleaseIdentity('', { RENDER_GIT_COMMIT: 'ABCDEF1234567' })).toEqual({ marker: OPERATIONS_RELEASE_MARKER, commit: 'abcdef1234567' })
    expect(resolveOperationsReleaseIdentity('not-a-sha', {})).toEqual({ marker: OPERATIONS_RELEASE_MARKER, commit: null })
  })
})
