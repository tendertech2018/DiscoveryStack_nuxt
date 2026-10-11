import { createHash } from 'node:crypto'
import { createReadStream, lstatSync } from 'node:fs'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { backupDigest, backupKey, decryptBackup } from './encrypted-backup.mjs'
import { validateOrigin } from './release-smoke.mjs'

const digest = value => /^[a-f0-9]{64}$/.test(value || '')
const email = value => typeof value === 'string' && value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value)
export async function probeTaskMonitor(env, fetcher = fetch) {
  if (!digest(env.DS_OPS_MONITOR_TOKEN)) throw new Error('ops_monitor_token_invalid')
  const origin = validateOrigin(env.DS_OPS_ORIGIN)
  const response = await fetcher(`${origin}/api/operations/monitor`, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${env.DS_OPS_MONITOR_TOKEN}`, accept: 'application/json' } })
  if (response.status !== 200 || !/no-store/i.test(response.headers.get('cache-control') || '') || !response.body) { await response.body?.cancel(); return { status: 'FAIL' } }
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 4096) throw new Error('ops_monitor_response_invalid')
      chunks.push(Buffer.from(value))
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return { status: body.version === 1 && body.status === 'PASS' && ['ready', 'disabled'].includes(body.scheduler) && body.evidence === 'process_local_heartbeats' ? 'PASS' : 'FAIL' }
  } finally { await reader.cancel().catch(() => {}) }
}
export function notificationConfig(env) {
  if (!/^re_[A-Za-z0-9_-]{8,512}$/.test(env.DS_OPS_RESEND_API_KEY || '') || !email(env.DS_OPS_ALERT_FROM) || !email(env.DS_OPS_ALERT_TO)) throw new Error('ops_notification_config_invalid')
  return { key: env.DS_OPS_RESEND_API_KEY, from: env.DS_OPS_ALERT_FROM, to: env.DS_OPS_ALERT_TO }
}

export async function sendOperationsNotification(env, { key, event }, fetcher = fetch) {
  const config = notificationConfig(env)
  if (!digest(key) || !['SERVICE_UNHEALTHY', 'SERVICE_RECOVERED'].includes(event)) throw new Error('ops_notification_invalid')
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json', 'idempotency-key': `ds-ops-${key}` },
    body: JSON.stringify({ from: config.from, to: [config.to], subject: `DiscoveryStack ${event}`, text: `DiscoveryStack operations: ${event}.\nEvent reference: ${key}\nCheck the operator ledger and Owner operations page. No customer content is included.` }),
  })
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('ops_notification_not_confirmed') }
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 16384) throw new Error('ops_notification_response_invalid')
      chunks.push(Buffer.from(value))
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.id || '')) throw new Error('ops_notification_response_invalid')
    return { providerAccepted: true, inboxDeliveryVerified: false }
  } finally { await reader.cancel().catch(() => {}) }
}

export function offsiteConfig(env) {
  const region = env.DS_OPS_S3_REGION || ''
  const bucket = env.DS_OPS_S3_BUCKET || ''
  if (!(env.DS_OPS_S3_ENDPOINT && region === 'auto') && !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
    || !/^[A-Za-z0-9]{16,128}$/.test(env.DS_OPS_S3_ACCESS_KEY_ID || '') || !/^[A-Za-z0-9/+=]{20,256}$/.test(env.DS_OPS_S3_SECRET_ACCESS_KEY || '')) throw new Error('ops_offsite_config_invalid')
  const endpoint = env.DS_OPS_S3_ENDPOINT
  if (endpoint && !/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint)) throw new Error('ops_offsite_endpoint_invalid')
  if (region.startsWith('cn-')) throw new Error('ops_offsite_region_unsupported')
  return { bucket, r2: Boolean(endpoint), client: { region, endpoint: endpoint || `https://s3.${region}.amazonaws.com`, forcePathStyle: true, ignoreConfiguredEndpointUrls: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', credentials: { accessKeyId: env.DS_OPS_S3_ACCESS_KEY_ID, secretAccessKey: env.DS_OPS_S3_SECRET_ACCESS_KEY }, maxAttempts: 1, requestHandler: { connectionTimeout: 10000, requestTimeout: 120000 } } }
}

/** Upload authenticated ciphertext only; verify by downloading bytes, not trusting ETag. */
export async function copyBackupOffsite(env, { path, key, sha256, bytes }, clientOverride) {
  const config = offsiteConfig(env)
  if (!digest(key) || !digest(sha256) || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 1024 ** 3) throw new Error('ops_offsite_receipt_invalid')
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new Error('ops_offsite_file_invalid')
  await decryptBackup(path, backupKey(env.DS_BACKUP_ENCRYPTION_KEY))
  const actual = await backupDigest(path)
  if (actual.sha256 !== sha256 || actual.bytes !== bytes) throw new Error('ops_offsite_digest_mismatch')
  // R2 supports Content-MD5 on PutObject; do not assume AWS full-object SHA256 headers.
  let checksum = { ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64') }
  if (config.r2) {
    const md5 = createHash('md5')
    for await (const chunk of createReadStream(path)) md5.update(chunk)
    checksum = { ContentMD5: md5.digest('base64') }
  }
  const client = clientOverride || new S3Client(config.client)
  const object = { Bucket: config.bucket, Key: `discoverystack-encrypted/${key}.dsbackup` }
  const signal = AbortSignal.timeout(180000)
  const source = createReadStream(path)
  try {
    await client.send(new PutObjectCommand({ ...object, Body: source, ContentLength: bytes, ContentType: 'application/octet-stream', IfNoneMatch: '*', ...checksum }), { abortSignal: signal })
    const result = await client.send(new GetObjectCommand(object), { abortSignal: signal })
    if (!result.Body) throw new Error('ops_offsite_readback_empty')
    const hash = createHash('sha256')
    let received = 0
    try {
      for await (const chunk of result.Body) {
        received += chunk.length
        if (received > bytes) throw new Error('ops_offsite_readback_mismatch')
        hash.update(chunk)
      }
    } finally { result.Body.destroy?.() }
    if (received !== bytes || hash.digest('hex') !== sha256) throw new Error('ops_offsite_readback_mismatch')
    return { offsiteCopied: true, offsiteReadbackVerified: true, restoreVerified: false }
  } finally { source.destroy(); if (!clientOverride) client.destroy() }
}
