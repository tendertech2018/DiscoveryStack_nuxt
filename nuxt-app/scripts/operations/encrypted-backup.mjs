import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, stat, unlink } from 'node:fs/promises'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'

const MAGIC = 'DSBACKUP1\n'
const HEADER_LIMIT = 4096
const TAG_BYTES = 16
const MAX_PLAINTEXT_BYTES = 100 * 1024 ** 3

export function backupKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('backup_key_invalid')
  return Buffer.from(value, 'hex')
}

export function databaseFingerprint(url) {
  return createHash('sha256').update(`${url.hostname.toLowerCase()}:${url.port || '3306'}${url.pathname}`).digest('hex')
}

function byteCounter(limit = MAX_PLAINTEXT_BYTES) {
  let bytes = 0
  const stream = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length
    callback(bytes > limit ? new Error('backup_size_limit') : null, chunk)
  } })
  return { stream, bytes: () => bytes }
}

/** A failed stream never leaves a file that could be mistaken for a valid backup. */
export async function encryptBackup(source, destination, key, sourceFingerprint) {
  if (!Buffer.isBuffer(key) || key.length !== 32 || !/^[a-f0-9]{64}$/.test(sourceFingerprint)) throw new Error('backup_configuration_invalid')
  const iv = randomBytes(12)
  const metadata = { version: 1, createdAt: new Date().toISOString(), sourceFingerprint, iv: iv.toString('hex'), compression: 'gzip' }
  const header = Buffer.from(`${MAGIC}${JSON.stringify(metadata)}\n`)
  let sourceFailure
  const onSourceError = error => { sourceFailure = error }
  source.on('error', onSourceError)
  let file
  let committed = false
  const counter = byteCounter()
  try {
    file = await open(destination, 'wx', 0o600)
    await file.write(header, 0, header.length, 0)
    if (sourceFailure) throw sourceFailure
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(header)
    const output = createWriteStream(destination, { fd: file.fd, start: header.length, autoClose: false })
    await pipeline(source, counter.stream, createGzip(), cipher, output)
    if (!counter.bytes()) throw new Error('backup_empty')
    const size = (await file.stat()).size
    const tag = cipher.getAuthTag()
    await file.write(tag, 0, tag.length, size)
    await file.sync()
    committed = true
    return { format: 'ds-encrypted-backup-v1', createdAt: metadata.createdAt, encryptedBytes: size + TAG_BYTES, plaintextBytes: counter.bytes() }
  } finally {
    if (file) await file.close().catch(() => {})
    if (file && !committed) await unlink(destination).catch(() => {})
    source.off('error', onSourceError)
  }
}

async function readHeader(path) {
  const file = await open(path, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size < MAGIC.length + 40 + TAG_BYTES) throw new Error('backup_invalid')
    const prefix = Buffer.alloc(Math.min(HEADER_LIMIT, info.size))
    await file.read(prefix, 0, prefix.length, 0)
    if (!prefix.subarray(0, MAGIC.length).equals(Buffer.from(MAGIC))) throw new Error('backup_format_invalid')
    const headerEnd = prefix.indexOf(10, MAGIC.length)
    if (headerEnd < 0 || headerEnd + 1 >= info.size - TAG_BYTES) throw new Error('backup_header_invalid')
    let metadata
    try { metadata = JSON.parse(prefix.subarray(MAGIC.length, headerEnd).toString('utf8')) } catch { throw new Error('backup_header_invalid') }
    if (metadata.version !== 1 || metadata.compression !== 'gzip' || !/^[a-f0-9]{24}$/.test(metadata.iv) || !/^[a-f0-9]{64}$/.test(metadata.sourceFingerprint)) throw new Error('backup_header_invalid')
    const tag = Buffer.alloc(TAG_BYTES)
    await file.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES)
    return { metadata, header: prefix.subarray(0, headerEnd + 1), tag, size: info.size }
  } finally { await file.close() }
}

/** The destination is trusted scratch space only: GCM authenticates at stream end. */
export async function decryptBackup(path, key, destination = new Writable({ write(_chunk, _encoding, done) { done() } }), limit = MAX_PLAINTEXT_BYTES) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('backup_key_invalid')
  const { metadata, header, tag, size } = await readHeader(path)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(metadata.iv, 'hex'))
  decipher.setAAD(header)
  decipher.setAuthTag(tag)
  const counter = byteCounter(limit)
  try {
    await pipeline(createReadStream(path, { start: header.length, end: size - TAG_BYTES - 1 }), decipher, createGunzip(), counter.stream, destination)
  } catch { throw new Error('backup_authentication_or_stream_failed') }
  if (!counter.bytes()) throw new Error('backup_empty')
  return { format: 'ds-encrypted-backup-v1', createdAt: metadata.createdAt, sourceFingerprint: metadata.sourceFingerprint, encryptedBytes: size, plaintextBytes: counter.bytes(), authenticated: true }
}

export async function backupDigest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return { sha256: hash.digest('hex'), bytes: (await stat(path)).size }
}
