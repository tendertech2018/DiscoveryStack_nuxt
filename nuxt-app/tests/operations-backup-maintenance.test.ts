import { describe, expect, it, vi } from 'vitest'
import { planBackupMaintenance, runBackupMaintenance } from '../scripts/operations/backup-maintenance.mjs'

const input = { enabled: true, now: '2026-10-12T00:00:00Z', lastAuthenticatedAt: null, intervalHours: 24, sourceFingerprint: 'a'.repeat(64) }
function dependencies() {
  const claimed = new Set<string>()
  return {
    ledger: { claim: vi.fn(async (key: string) => { if (claimed.has(key)) return false; claimed.add(key); return true }), complete: vi.fn(async () => {}) },
    environment: { DS_BACKUP_ENCRYPTION_KEY: 'synthetic-only' }, outputPath: '/private/tmp/fixture.dsbackup',
    execute: vi.fn(async () => ({ status: 'PASS', authenticated: true, sha256: 'b'.repeat(64), bytes: 123, secret: 'never-return' })),
  }
}
describe('default-off backup scheduling seam', () => {
  it('does nothing unless explicitly enabled and due', async () => {
    const deps = dependencies()
    expect(await runBackupMaintenance({}, deps)).toMatchObject({ status: 'disabled' })
    expect(planBackupMaintenance({ ...input, lastAuthenticatedAt: '2026-10-11T23:00:00Z' })).toMatchObject({ status: 'not_due' })
    expect(deps.execute).not.toHaveBeenCalled()
  })
  it.each([{ now: 'invalid' }, { intervalHours: 0 }, { intervalHours: 169 }, { lastAuthenticatedAt: '2026-10-13T00:00:00Z' }, { sourceFingerprint: 'secret' }])('rejects invalid metadata %j', change => {
    expect(planBackupMaintenance({ ...input, ...change })).toMatchObject({ status: 'blocked' })
  })
  it('requires a durable adapter and never runs twice for one claimed slot', async () => {
    expect(await runBackupMaintenance(input)).toMatchObject({ code: 'BACKUP_SCHEDULE_ADAPTER_REQUIRED' })
    const deps = dependencies()
    const results = await Promise.all([runBackupMaintenance(input, deps), runBackupMaintenance(input, deps)])
    expect(results.map(r => r.status).sort()).toEqual(['blocked', 'completed'])
    expect(deps.execute).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(results)).not.toMatch(/synthetic-only|never-return|fixture.dsbackup/)
    expect(results.find(r => r.status === 'completed')).toMatchObject({ offsiteCopied: false, restoreVerified: false })
  })
  it('keeps uncertain claims closed after command or receipt persistence failure', async () => {
    for (const stage of ['execute', 'complete'] as const) {
      const deps = dependencies()
      if (stage === 'execute') deps.execute.mockRejectedValueOnce(new Error('raw-secret'))
      else deps.ledger.complete.mockRejectedValueOnce(new Error('raw-secret'))
      expect(await runBackupMaintenance(input, deps)).toEqual({ status: 'requires_reconciliation', code: 'BACKUP_SCHEDULE_RECONCILIATION_REQUIRED' })
      expect(await runBackupMaintenance(input, deps)).toMatchObject({ status: 'blocked' })
      expect(deps.execute).toHaveBeenCalledTimes(1)
    }
  })
})
