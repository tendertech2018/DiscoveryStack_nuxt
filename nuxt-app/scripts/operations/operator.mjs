import { createHash } from 'node:crypto'
import { resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openLedger, privateDirectory } from './durable-ledger.mjs'
import { runBackupMaintenance, planBackupMaintenance } from './backup-maintenance.mjs'
import { parseDatabaseUrl } from './database-backup.mjs'
import { backupKey, databaseFingerprint } from './encrypted-backup.mjs'
import { runReleaseSmoke, validateOrigin } from './release-smoke.mjs'
import { copyBackupOffsite, notificationConfig, offsiteConfig, sendOperationsNotification, probeTaskMonitor } from './operations-transports.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const enabled = (env, name) => env[name] === 'true'
function interval(env) {
  const value = env.DS_OPS_BACKUP_INTERVAL_HOURS || '24'
  if (!/^\d+$/.test(value) || +value < 1 || +value > 168) throw new Error('ops_interval_invalid')
  return +value
}
function backupConfiguration(env) {
  const database = parseDatabaseUrl(env.DS_BACKUP_DATABASE_URL)
  backupKey(env.DS_BACKUP_ENCRYPTION_KEY)
  if (!isAbsolute(env.DS_OPS_BACKUP_DIR || '')) throw new Error('ops_backup_directory_required')
  if (enabled(env, 'DS_OPS_ENABLE_OFFSITE')) offsiteConfig(env)
  return { sourceFingerprint: databaseFingerprint(database), intervalHours: interval(env) }
}
function monitorConfiguration(env) {
  const origin = validateOrigin(env.DS_OPS_ORIGIN)
  if (!/^[a-f0-9]{40}$/.test(env.DS_OPS_EXPECT_COMMIT || '')) throw new Error('ops_expected_commit_required')
  if (enabled(env, 'DS_OPS_ENABLE_ALERTS')) notificationConfig(env)
  if (enabled(env, 'DS_OPS_ENABLE_BACKUP')) backupConfiguration(env)
  if (enabled(env, 'DS_OPS_ENABLE_TASK_MONITOR') && !/^[a-f0-9]{64}$/.test(env.DS_OPS_MONITOR_TOKEN || '')) throw new Error('ops_monitor_token_invalid')
  return { origin, expectedCommit: env.DS_OPS_EXPECT_COMMIT }
}

/** Pure, redacted config inspection. Does not open SQLite, files, databases or providers. */
export function operatorPreflight(env = {}) {
  const checks = []
  for (const [id, toggle, check] of [
    ['backup', 'DS_OPS_ENABLE_BACKUP', backupConfiguration],
    ['monitor', 'DS_OPS_ENABLE_MONITOR', monitorConfiguration],
    ['offsite', 'DS_OPS_ENABLE_OFFSITE', offsiteConfig],
    ['alerts', 'DS_OPS_ENABLE_ALERTS', notificationConfig],
    ['task_monitor', 'DS_OPS_ENABLE_TASK_MONITOR', monitorConfiguration],
  ]) {
    let status = 'disabled'
    if (enabled(env, toggle)) {
      try { check(env); status = 'configured_unverified' } catch { status = 'invalid' }
    } else if (env[toggle] && env[toggle] !== 'false') status = 'invalid'
    checks.push({ id, status })
  }
  checks.push({ id: 'private_persistent_state', status: isAbsolute(env.DS_OPS_STATE_DIR || '') ? 'configured_unverified' : 'missing' })
  checks.push({ id: 'toggle_dependencies', status: (enabled(env, 'DS_OPS_ENABLE_ALERTS') || enabled(env, 'DS_OPS_ENABLE_TASK_MONITOR')) && !enabled(env, 'DS_OPS_ENABLE_MONITOR') || enabled(env, 'DS_OPS_ENABLE_OFFSITE') && !enabled(env, 'DS_OPS_ENABLE_BACKUP') ? 'invalid' : 'configured_unverified' })
  return { kind: 'configuration_only', externalCallsPerformed: false, productionAcceptance: 'NOT_RUN', checks }
}

export async function backupTick(env, ledger, now = new Date().toISOString(), dependencies = {}) {
  if (!enabled(env, 'DS_OPS_ENABLE_BACKUP')) return { status: 'disabled', code: 'BACKUP_DISABLED' }
  const config = backupConfiguration(env)
  const scope = hash(`backup:${config.sourceFingerprint}`)
  const prior = ledger.latest(scope)
  const input = { enabled: true, now, ...config, lastAuthenticatedAt: prior?.state === 'completed' ? prior.receipt?.completedAt : null }
  const plan = planBackupMaintenance(input)
  if (plan.status !== 'due') return plan
  const directory = privateDirectory(env.DS_OPS_BACKUP_DIR)
  let claim
  let offsite = { offsiteCopied: false, offsiteReadbackVerified: false, restoreVerified: false }
  const result = await runBackupMaintenance(input, {
    environment: env, outputPath: resolve(directory, `${plan.slotKey}.dsbackup`),
    ...(dependencies.execute ? { execute: dependencies.execute } : {}),
    ledger: {
      claim: key => Boolean(claim = ledger.claim(scope, key, now)),
      complete: async (_key, receipt) => {
        ledger.checkpoint(claim, { ...receipt, ...offsite })
        if (enabled(env, 'DS_OPS_ENABLE_OFFSITE')) offsite = await (dependencies.copy || copyBackupOffsite)(env, { path: resolve(directory, `${plan.slotKey}.dsbackup`), key: plan.slotKey, ...receipt })
        // Completion time, not start time, defines the next due interval.
        ledger.complete(claim, { ...receipt, ...offsite, completedAt: dependencies.completedAt || new Date().toISOString() })
      },
    },
  })
  return { ...result, ...offsite }
}

/** Run from a different host to detect application-host failure. No Owner credentials. */
export async function monitorTick(env, ledger, now = new Date().toISOString(), dependencies = {}) {
  if (!enabled(env, 'DS_OPS_ENABLE_MONITOR')) return { status: 'disabled', code: 'MONITOR_DISABLED' }
  const config = monitorConfiguration(env)
  const scope = hash(`monitor:${config.origin}`)
  const prior = ledger.latest(scope)
  const time = Date.parse(now)
  if (!Number.isFinite(time)) throw new Error('ops_time_invalid')
  // External scheduler should invoke once per minute; prevent high-frequency alert bursts.
  if (prior && time - Date.parse(prior.started) < 60000) return { status: 'not_due', code: 'MONITOR_NOT_DUE' }
  const key = hash(`${scope}:${Math.floor(time / 60000)}`)
  const claim = ledger.claim(scope, key, now)
  if (!claim) return { status: 'blocked', code: 'MONITOR_RECONCILIATION_REQUIRED' }
  try {
    const smoke = await (dependencies.probe || runReleaseSmoke)(config)
    if (!['PASS', 'FAIL'].includes(smoke?.status)) throw new Error('ops_probe_invalid')
    let taskStatus = 'not_monitored'
    if (enabled(env, 'DS_OPS_ENABLE_TASK_MONITOR')) {
      try { taskStatus = (await (dependencies.tasks || probeTaskMonitor)(env))?.status === 'PASS' ? 'PASS' : 'FAIL' } catch { taskStatus = 'FAIL' }
    }
    const previous = prior?.receipt?.monitor || { failures: 0, successes: 0, incident: false, alertAttempted: false }
    let backupStatus = 'not_monitored'
    if (enabled(env, 'DS_OPS_ENABLE_BACKUP')) {
      const backup = backupConfiguration(env)
      const state = ledger.inspectScope(hash(`backup:${backup.sourceFingerprint}`))
      const completed = Date.parse(state.lastCompleted?.completedAt)
      const fresh = Number.isFinite(completed) && time >= completed && time - completed <= (backup.intervalHours + 1) * 3600000
      const stalled = state.activeSince && time - Date.parse(state.activeSince) > 45 * 60000
      const offsiteReady = !enabled(env, 'DS_OPS_ENABLE_OFFSITE') || state.lastCompleted?.offsiteReadbackVerified === true
      backupStatus = fresh && !stalled && offsiteReady ? 'PASS' : 'FAIL'
    }
    const pass = smoke.status === 'PASS' && backupStatus !== 'FAIL' && taskStatus !== 'FAIL'
    const monitor = {
      failures: pass ? 0 : Math.min(previous.failures + 1, 3),
      successes: pass ? Math.min(previous.successes + 1, 2) : 0,
      incident: previous.incident,
      alertAttempted: previous.alertAttempted === true,
    }
    let event = null
    if (monitor.incident && monitor.successes >= 2) {
      event = monitor.alertAttempted ? 'SERVICE_RECOVERED' : null
      monitor.incident = false
      monitor.alertAttempted = false
    } else if (monitor.failures >= 3) {
      monitor.incident = true
      if (!monitor.alertAttempted && enabled(env, 'DS_OPS_ENABLE_ALERTS')) {
        event = 'SERVICE_UNHEALTHY'
        monitor.alertAttempted = true
      }
    }
    const receipt = { monitor, probeStatus: pass ? 'PASS' : 'FAIL', backupStatus, taskStatus, event, providerAccepted: false, inboxDeliveryVerified: false }
    // Persist decision before sending; uncertain sends never automatically replay.
    ledger.checkpoint(claim, receipt)
    if (event && enabled(env, 'DS_OPS_ENABLE_ALERTS')) Object.assign(receipt, await (dependencies.notify || sendOperationsNotification)(env, { key, event }))
    ledger.complete(claim, receipt)
    return { status: 'completed', ...receipt, coverage: 'public_probes_plus_explicitly_enabled_task_and_backup_monitors' }
  } catch {
    return { status: 'requires_reconciliation', code: 'MONITOR_RECONCILIATION_REQUIRED' }
  }
}

export async function runOperator(args = [], env = {}) {
  const command = args[0] || 'preflight'
  if (command === 'preflight' && args.length <= 1) return operatorPreflight(env)
  const executable = ['backup-tick', 'monitor-tick'].includes(command) && args.length === 2 && args[1] === '--execute'
  const acknowledge = command === 'acknowledge' && args.length === 3 && args[1] === '--confirm-reviewed-no-replay' && /^[a-f0-9]{64}$/.test(args[2])
  const status = command === 'status' && args.length === 1
  if (!executable && !acknowledge && !status) throw new Error('ops_usage_invalid')
  if (executable && !enabled(env, command === 'backup-tick' ? 'DS_OPS_ENABLE_BACKUP' : 'DS_OPS_ENABLE_MONITOR')) return { status: 'disabled' }
  // Validate all network configuration before any directory/ledger mutation.
  if (executable) (command === 'backup-tick' ? backupConfiguration : monitorConfiguration)(env)
  const ledger = openLedger(env.DS_OPS_STATE_DIR)
  try {
    if (status) return { jobs: ledger.status(), note: 'claimed_requires_operator_review_no_automatic_replay' }
    if (acknowledge) return { acknowledged: ledger.acknowledge(args[2]), providerAcceptanceEstablished: false, backupAcceptanceEstablished: false }
    return command === 'backup-tick' ? await backupTick(env, ledger) : await monitorTick(env, ledger)
  } finally { ledger.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runOperator(process.argv.slice(2), process.env).then(result => {
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = ['blocked', 'requires_reconciliation'].includes(result.status) || result.checks?.some(check => check.status === 'invalid') || result.probeStatus === 'FAIL' ? 1 : 0
  }).catch(() => {
    console.error(JSON.stringify({ status: 'blocked', code: 'OPERATOR_CONFIGURATION_OR_EXECUTION_FAILED', productionAcceptance: 'NOT_RUN' }))
    process.exitCode = 1
  })
}
