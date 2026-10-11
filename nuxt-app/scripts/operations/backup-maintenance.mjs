import { createHash } from 'node:crypto'
import { runBackupCommand, validateBackupPath } from './database-backup.mjs'

/** Host-owned scheduler seam. Nothing is scheduled or enabled by importing this module. */
export function planBackupMaintenance(input = {}) {
  if (input.enabled !== true) return { status: 'disabled', code: 'BACKUP_SCHEDULE_DISABLED' }
  const { now, lastAuthenticatedAt, intervalHours, sourceFingerprint } = input
  const time = Date.parse(now)
  const prior = lastAuthenticatedAt == null ? null : Date.parse(lastAuthenticatedAt)
  if (!Number.isFinite(time) || !Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168
    || !/^[a-f0-9]{64}$/.test(sourceFingerprint || '') || (prior !== null && (!Number.isFinite(prior) || prior > time))) {
    return { status: 'blocked', code: 'BACKUP_SCHEDULE_METADATA_INVALID' }
  }
  const period = intervalHours * 3600000
  if (prior !== null && time - prior < period) return { status: 'not_due', code: 'BACKUP_SCHEDULE_NOT_DUE' }
  const slot = Math.floor(time / period)
  return { status: 'due', code: 'BACKUP_SCHEDULE_DUE', slotKey: createHash('sha256').update(`${sourceFingerprint}:${intervalHours}:${slot}`).digest('hex') }
}

/**
 * ledger.claim must be a durable, atomic, single-winner claim. An unresolved claim
 * must NOT expire into automatic replay; reconcile manually after an ambiguous exit.
 * Deployments must supply that adapter and protected credentials explicitly.
 */
export async function runBackupMaintenance(input, dependencies = {}) {
  const plan = planBackupMaintenance(input)
  if (plan.status !== 'due') return plan
  const { ledger, environment, outputPath, execute = runBackupCommand } = dependencies
  if (!ledger?.claim || !ledger?.complete || !environment || !outputPath) return { status: 'blocked', code: 'BACKUP_SCHEDULE_ADAPTER_REQUIRED' }
  try { validateBackupPath(outputPath) } catch { return { status: 'blocked', code: 'BACKUP_SCHEDULE_PATH_INVALID' } }
  try {
    if (!await ledger.claim(plan.slotKey)) return { status: 'blocked', code: 'BACKUP_SCHEDULE_ALREADY_CLAIMED' }
    const result = await execute(['snapshot', '--output', outputPath], environment)
    if (result?.status !== 'PASS' || result.authenticated !== true || !/^[a-f0-9]{64}$/.test(result.sha256 || '') || !Number.isSafeInteger(result.bytes) || result.bytes <= 0) throw new Error('invalid_receipt')
    // Deliberately omit paths, credentials, raw errors and arbitrary provider fields.
    const receipt = { sha256: result.sha256, bytes: result.bytes, authenticated: true, completedAt: input.now }
    await ledger.complete(plan.slotKey, receipt)
    return { status: 'completed', code: 'BACKUP_SNAPSHOT_AUTHENTICATED', receipt, offsiteCopied: false, restoreVerified: false }
  } catch {
    // Never release/retry an uncertain claim or delete a possibly valid snapshot.
    return { status: 'requires_reconciliation', code: 'BACKUP_SCHEDULE_RECONCILIATION_REQUIRED' }
  }
}
