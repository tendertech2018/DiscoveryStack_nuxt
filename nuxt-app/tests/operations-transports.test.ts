import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { backupDigest, encryptBackup } from '../scripts/operations/encrypted-backup.mjs'
import { copyBackupOffsite, notificationConfig, offsiteConfig, sendOperationsNotification, probeTaskMonitor } from '../scripts/operations/operations-transports.mjs'

const roots: string[] = []
const sha = 'a'.repeat(64)
const env = { DS_OPS_RESEND_API_KEY: 're_synthetic_fixture', DS_OPS_ALERT_FROM: 'ops@example.test', DS_OPS_ALERT_TO: 'owner@example.test', DS_OPS_S3_REGION: 'us-east-1', DS_OPS_S3_BUCKET: 'fixture-backups', DS_OPS_S3_ACCESS_KEY_ID: 'A'.repeat(20), DS_OPS_S3_SECRET_ACCESS_KEY: 'b'.repeat(40), DS_BACKUP_ENCRYPTION_KEY: 'c'.repeat(64) }
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ds-offsite-fixture-')); roots.push(root)
  const path = join(root, 'encrypted.dsbackup')
  await encryptBackup(Readable.from(['-- synthetic SQL only\nSELECT 1;']), path, Buffer.from(env.DS_BACKUP_ENCRYPTION_KEY, 'hex'), sha)
  return { path, key: sha, ...await backupDigest(path) }
}
describe('operator notification adapter', () => {
  it('reads only an authenticated, bounded task summary without following redirects', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ version: 1, status: 'PASS', scheduler: 'ready', evidence: 'process_local_heartbeats' }), { headers: { 'cache-control': 'no-store' } }))
    const config = { DS_OPS_ORIGIN: 'https://example.test', DS_OPS_MONITOR_TOKEN: sha }
    expect(await probeTaskMonitor(config, fetcher)).toEqual({ status: 'PASS' })
    expect(fetcher.mock.calls[0]![0]).toBe('https://example.test/api/operations/monitor')
    expect(fetcher.mock.calls[0]![1]?.redirect).toBe('error')
    expect(await probeTaskMonitor(config, async () => new Response('{}', { status: 401 }))).toEqual({ status: 'FAIL' })
    await expect(probeTaskMonitor(config, async () => new Response('x'.repeat(4097), { headers: { 'cache-control': 'no-store' } }))).rejects.toThrow('ops_monitor_response_invalid')
  })
  it('uses fixed endpoint, stable idempotency, no customer payload; acceptance is not inbox proof', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: '12345678-1234-1234-1234-123456789abc' }), { status: 200 }))
    expect(await sendOperationsNotification(env, { key: sha, event: 'SERVICE_UNHEALTHY' }, fetcher)).toEqual({ providerAccepted: true, inboxDeliveryVerified: false })
    const [url, options] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.resend.com/emails')
    expect(options?.redirect).toBe('error')
    expect(new Headers(options?.headers).get('idempotency-key')).toBe(`ds-ops-${sha}`)
    expect(options?.body).not.toMatch(/mysql:|password|re_synthetic_fixture/)
    expect(JSON.parse(options?.body as string).text).toContain('No customer content is included.')
  })
  it.each([401, 429, 500])('does not retry provider rejection %s', async status => {
    const fetcher = vi.fn(async () => new Response('provider-secret', { status }))
    await expect(sendOperationsNotification(env, { key: sha, event: 'SERVICE_UNHEALTHY' }, fetcher)).rejects.toThrow('ops_notification_not_confirmed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed/oversized responses and header injection', async () => {
    expect(() => notificationConfig({ ...env, DS_OPS_ALERT_TO: 'a@example.test\r\nBcc:x@example.test' })).toThrow()
    for (const body of ['{}', 'x'.repeat(17000)]) await expect(sendOperationsNotification(env, { key: sha, event: 'SERVICE_RECOVERED' }, async () => new Response(body))).rejects.toThrow('ops_notification_response_invalid')
  })
})
describe('encrypted S3 copy adapter', () => {
  it('requires explicit credentials and rejects arbitrary endpoints', () => {
    expect(() => offsiteConfig({})).toThrow()
    expect(() => offsiteConfig({ ...env, DS_OPS_S3_ENDPOINT: 'http://127.0.0.1:3306' })).toThrow()
    expect(offsiteConfig(env).client.maxAttempts).toBe(1)
  })
  it('uploads only encrypted bytes with conditional create, then verifies full readback', async () => {
    const receipt = await fixture()
    const encrypted = await readFile(receipt.path)
    const send = vi.fn(async (command: any) => {
      if (command.constructor.name === 'PutObjectCommand') {
        const chunks = []
        for await (const chunk of command.input.Body) chunks.push(chunk)
        expect(Buffer.concat(chunks)).toEqual(encrypted)
        expect(command.input.IfNoneMatch).toBe('*')
        expect(command.input.ChecksumSHA256).toBe(Buffer.from(receipt.sha256, 'hex').toString('base64'))
        return {}
      }
      return { Body: Readable.from([encrypted]) }
    })
    expect(await copyBackupOffsite(env, receipt, { send })).toEqual({ offsiteCopied: true, offsiteReadbackVerified: true, restoreVerified: false })
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('does not upload plaintext, unauthenticated or mismatched files', async () => {
    const receipt = await fixture(), send = vi.fn()
    await expect(copyBackupOffsite(env, { ...receipt, sha256: 'f'.repeat(64) }, { send })).rejects.toThrow('ops_offsite_digest_mismatch')
    await expect(copyBackupOffsite({ ...env, DS_BACKUP_ENCRYPTION_KEY: 'd'.repeat(64) }, receipt, { send })).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
  it('uses R2-compatible Content-MD5 and still verifies SHA256 of downloaded ciphertext', async () => {
    const receipt = await fixture(), encrypted = await readFile(receipt.path)
    const r2 = { ...env, DS_OPS_S3_ACCESS_KEY_ID: 'c'.repeat(32), DS_OPS_S3_REGION: 'auto', DS_OPS_S3_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com` }
    expect(offsiteConfig(r2).client.requestChecksumCalculation).toBe('WHEN_REQUIRED')
    const send = vi.fn(async (command: any) => {
      if (command.constructor.name === 'PutObjectCommand') {
        expect(command.input.ContentMD5).toBe(createHash('md5').update(encrypted).digest('base64'))
        expect(command.input.ChecksumSHA256).toBeUndefined()
        expect(command.input.IfNoneMatch).toBe('*')
        return {}
      }
      return { Body: Readable.from([encrypted]) }
    })
    expect(await copyBackupOffsite(r2, receipt, { send })).toMatchObject({ offsiteReadbackVerified: true })
  })
  it('fails closed on readback mismatch without deleting or retrying an uploaded object', async () => {
    const receipt = await fixture()
    const send = vi.fn(async (command: any) => command.constructor.name === 'PutObjectCommand' ? {} : { Body: Readable.from(['wrong']) })
    await expect(copyBackupOffsite(env, receipt, { send })).rejects.toThrow('ops_offsite_readback_mismatch')
    expect(send).toHaveBeenCalledTimes(2)
  })
})
