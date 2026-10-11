import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, chmodSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { openLedger, privateDirectory } from '../scripts/operations/durable-ledger.mjs'
import { backupTick, monitorTick, operatorPreflight, runOperator } from '../scripts/operations/operator.mjs'

const roots: string[] = []
const ledgers: ReturnType<typeof openLedger>[] = []
const sha = 'a'.repeat(64)
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ds-operator-fixture-'))
  roots.push(root)
  const directory = join(root, 'state')
  const ledger = openLedger(directory)
  ledgers.push(ledger)
  return { root, directory, ledger }
}
const now = (minute: number) => new Date(Date.UTC(2026, 9, 12, 0, minute)).toISOString()
const backupEnv = (root: string) => ({ DS_OPS_ENABLE_BACKUP: 'true', DS_BACKUP_DATABASE_URL: 'mysql://fixture:synthetic@127.0.0.1/ds_fixture', DS_BACKUP_ENCRYPTION_KEY: 'c'.repeat(64), DS_OPS_BACKUP_DIR: join(root, 'snapshots') })
const monitorEnv = { DS_OPS_ENABLE_MONITOR: 'true', DS_OPS_ENABLE_ALERTS: 'true', DS_OPS_ORIGIN: 'https://example.test', DS_OPS_EXPECT_COMMIT: 'a'.repeat(40), DS_OPS_RESEND_API_KEY: 're_fixture_only_123', DS_OPS_ALERT_FROM: 'ops@example.test', DS_OPS_ALERT_TO: 'owner@example.test' }
afterEach(() => {
  for (const ledger of ledgers.splice(0)) ledger.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('durable operator ledger', () => {
  it('persists claims through restart and blocks other slots in the same scope', () => {
    const { ledger, directory } = fixture()
    const claim = ledger.claim(sha, sha, now(0))
    expect(claim).toBeTruthy()
    const restarted = openLedger(directory); ledgers.push(restarted)
    expect(restarted.claim(sha, 'b'.repeat(64), now(1))).toBeNull()
    expect(() => restarted.complete({ ...claim, token: 'wrong' }, {})).toThrow('ops_claim_lost')
    ledger.checkpoint(claim, { checkpoint: 'safe' })
    expect(restarted.acknowledge(sha)).toBe(true)
    expect(restarted.latest(sha)).toMatchObject({ state: 'acknowledged', receipt: { checkpoint: 'safe' } })
    expect(restarted.claim(sha, sha, now(2))).toBeNull()
    expect(restarted.claim(sha, 'b'.repeat(64), now(2))).toBeTruthy()
    expect(JSON.stringify(restarted.status())).not.toContain(claim!.token)
  })
  it('enforces claims across independent Node processes', () => {
    const { ledger, directory } = fixture()
    ledger.claim(sha, sha, now(0))
    const module = new URL('../scripts/operations/durable-ledger.mjs', import.meta.url).href
    const script = `import {openLedger} from ${JSON.stringify(module)}; const db=openLedger(${JSON.stringify(directory)}); console.log(db.claim('${sha}','${'b'.repeat(64)}','${now(1)}'));db.close()`
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    expect(child.status, child.stderr).toBe(0)
    expect(child.stdout.trim()).toBe('null')
  })
  it('rejects repository paths, symlinks and permissive directories', () => {
    const { root } = fixture()
    expect(() => privateDirectory(process.cwd())).toThrow()
    const loose = join(root, 'loose'); mkdirSync(loose, { mode: 0o700 }); chmodSync(loose, 0o755)
    expect(() => privateDirectory(loose)).toThrow('ops_directory_not_private')
    const link = join(root, 'link'); symlinkSync(loose, link)
    expect(() => privateDirectory(link)).toThrow('ops_directory_not_private')
  })
})

describe('operator entrypoint and redaction', () => {
  it('defaults to pure preflight, without secret values', async () => {
    const result = await runOperator([], { SECRET: 'do-not-expose' })
    expect(result).toMatchObject({ externalCallsPerformed: false, productionAcceptance: 'NOT_RUN' })
    expect(JSON.stringify(result)).not.toContain('do-not-expose')
    expect(await runOperator(['backup-tick', '--execute'], {})).toEqual({ status: 'disabled' })
    expect(operatorPreflight({ DS_OPS_ENABLE_ALERTS: 'true', DS_OPS_RESEND_API_KEY: 're_never_leak_123' }).checks).toContainEqual({ id: 'alerts', status: 'invalid' })
  })
  it.each([['backup-tick'], ['monitor-tick'], ['status', '--execute'], ['acknowledge', sha], ['preflight', '--execute']])('rejects unsafe or ambiguous command %j', async (...args) => {
    await expect(runOperator(args, {})).rejects.toThrow('ops_usage_invalid')
  })
})

describe('wired backup runner', () => {
  it('authenticates, persists completion and skips a subsequent tick', async () => {
    const { root, ledger } = fixture()
    const execute = vi.fn(async () => ({ status: 'PASS', authenticated: true, sha256: sha, bytes: 123 }))
    const first = await backupTick(backupEnv(root), ledger, now(0), { execute, completedAt: now(1) })
    expect(first).toMatchObject({ status: 'completed', offsiteCopied: false, restoreVerified: false })
    expect(await backupTick(backupEnv(root), ledger, now(2), { execute })).toMatchObject({ status: 'not_due' })
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('holds next-day jobs after ambiguous execution; never releases uncertain claims', async () => {
    const { root, ledger } = fixture()
    const execute = vi.fn(async () => { throw new Error('provider-secret') })
    expect(await backupTick(backupEnv(root), ledger, now(0), { execute })).toMatchObject({ status: 'requires_reconciliation' })
    expect(await backupTick(backupEnv(root), ledger, now(1441), { execute })).toMatchObject({ status: 'blocked' })
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('requires offsite readback before marking a job complete', async () => {
    const { root, ledger } = fixture()
    const env = { ...backupEnv(root), DS_OPS_ENABLE_OFFSITE: 'true', DS_OPS_S3_REGION: 'us-east-1', DS_OPS_S3_BUCKET: 'fixture-backups', DS_OPS_S3_ACCESS_KEY_ID: 'A'.repeat(20), DS_OPS_S3_SECRET_ACCESS_KEY: 'b'.repeat(40) }
    const execute = vi.fn(async () => ({ status: 'PASS', authenticated: true, sha256: sha, bytes: 123 }))
    const copy = vi.fn(async () => { throw new Error('uncertain-upload') })
    expect(await backupTick(env, ledger, now(0), { execute, copy })).toMatchObject({ status: 'requires_reconciliation', offsiteCopied: false })
    expect(ledger.status()[0].state).toBe('claimed')
    expect(await backupTick(env, ledger, now(1441), { execute, copy })).toMatchObject({ status: 'blocked' })
    expect(copy).toHaveBeenCalledTimes(1)
  })
})

describe('external monitor hysteresis and uncertain delivery', () => {
  it('sends one failure after three samples and one recovery after two healthy samples', async () => {
    const { ledger } = fixture()
    const probe = vi.fn(async () => ({ status: 'FAIL' }))
    const notify = vi.fn(async (_environment: unknown, _notification: { event: string }) => ({ providerAccepted: true, inboxDeliveryVerified: false }))
    for (let i = 0; i < 5; i++) await monitorTick(monitorEnv, ledger, now(i), { probe, notify })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0]![1].event).toBe('SERVICE_UNHEALTHY')
    probe.mockResolvedValue({ status: 'PASS' })
    await monitorTick(monitorEnv, ledger, now(5), { probe, notify })
    expect(notify).toHaveBeenCalledTimes(1)
    const recovery = await monitorTick(monitorEnv, ledger, now(6), { probe, notify })
    expect(recovery).toMatchObject({ event: 'SERVICE_RECOVERED', providerAccepted: true, inboxDeliveryVerified: false })
    expect(notify).toHaveBeenCalledTimes(2)
    expect(await monitorTick(monitorEnv, ledger, now(6), { probe, notify })).toMatchObject({ status: 'not_due' })
  })
  it('persists uncertain notification decision before transport and requires acknowledgement', async () => {
    const { ledger } = fixture()
    const probe = vi.fn(async () => ({ status: 'FAIL' }))
    const notify = vi.fn(async () => { throw new Error('secret-timeout') })
    for (let i = 0; i < 2; i++) await monitorTick(monitorEnv, ledger, now(i), { probe, notify })
    expect(await monitorTick(monitorEnv, ledger, now(2), { probe, notify })).toEqual({ status: 'requires_reconciliation', code: 'MONITOR_RECONCILIATION_REQUIRED' })
    expect(await monitorTick(monitorEnv, ledger, now(3), { probe, notify })).toMatchObject({ status: 'blocked' })
    const unresolved = ledger.status().find((row: any) => row.state === 'claimed')
    ledger.acknowledge(unresolved.key)
    await monitorTick(monitorEnv, ledger, now(4), { probe, notify })
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('does not send when notifications are disabled', async () => {
    const { ledger } = fixture()
    const probe = vi.fn(async () => ({ status: 'FAIL' })), notify = vi.fn()
    for (let i = 0; i < 4; i++) await monitorTick({ ...monitorEnv, DS_OPS_ENABLE_ALERTS: 'false' }, ledger, now(i), { probe, notify })
    expect(notify).not.toHaveBeenCalled()
    await monitorTick(monitorEnv, ledger, now(4), { probe, notify: async () => ({ providerAccepted: true, inboxDeliveryVerified: false }) })
    const last = ledger.status()[0]
    expect(last.state).toBe('completed')
  })
  it('alerts on overdue backup even when the application is healthy', async () => {
    const { root, ledger } = fixture()
    const probe = vi.fn(async () => ({ status: 'PASS' }))
    const notify = vi.fn(async () => ({ providerAccepted: true, inboxDeliveryVerified: false }))
    let result: any
    for (let i = 0; i < 3; i++) result = await monitorTick({ ...monitorEnv, ...backupEnv(root) }, ledger, now(i), { probe, notify })
    expect(result).toMatchObject({ backupStatus: 'FAIL', probeStatus: 'FAIL', event: 'SERVICE_UNHEALTHY' })
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('alerts on task monitor failure without calling the application mutation APIs', async () => {
    const { ledger } = fixture()
    const probe = vi.fn(async () => ({ status: 'PASS' }))
    const tasks = vi.fn(async () => { throw new Error('unavailable') })
    const notify = vi.fn(async () => ({ providerAccepted: true, inboxDeliveryVerified: false }))
    let result: any
    for (let i = 0; i < 3; i++) result = await monitorTick({ ...monitorEnv, DS_OPS_ENABLE_TASK_MONITOR: 'true', DS_OPS_MONITOR_TOKEN: sha }, ledger, now(i), { probe, notify, tasks })
    expect(result).toMatchObject({ taskStatus: 'FAIL', event: 'SERVICE_UNHEALTHY' })
    expect(notify).toHaveBeenCalledTimes(1)
  })
})
