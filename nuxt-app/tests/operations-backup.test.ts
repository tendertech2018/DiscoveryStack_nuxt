import { afterEach, describe, expect, it } from 'vitest'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { backupKey, databaseFingerprint, decryptBackup, encryptBackup } from '../scripts/operations/encrypted-backup.mjs'
import { mysqlDefaults, parseDatabaseUrl, runBackupCommand, validateBackupPath } from '../scripts/operations/database-backup.mjs'

const paths: string[] = []
async function scratch() { const path = await mkdtemp(join(tmpdir(), 'ds-backup-test-')); paths.push(path); return path }
const key = Buffer.alloc(32, 7)
const fingerprint = 'a'.repeat(64)
afterEach(async () => { await Promise.all(paths.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('authenticated database backup', () => {
  it('streams an encrypted snapshot, authenticates it, and preserves exact binary data', async () => {
    const file = join(await scratch(), 'test.dsbackup')
    const plaintext = Buffer.from('CREATE TABLE test (value BLOB);\n台灣\0fixture\n')
    await encryptBackup(Readable.from([plaintext]), file, key, fingerprint)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    const encrypted = await readFile(file)
    expect(encrypted.includes(plaintext)).toBe(false)
    const parts: Buffer[] = []
    const result = await decryptBackup(file, key, new Writable({ write(chunk, _enc, done) { parts.push(Buffer.from(chunk)); done() } }))
    expect(result).toMatchObject({ authenticated: true, plaintextBytes: plaintext.length, sourceFingerprint: fingerprint })
    expect(Buffer.concat(parts)).toEqual(plaintext)
  })

  it('never replaces an existing backup', async () => {
    const file = join(await scratch(), 'test.dsbackup')
    await writeFile(file, 'original')
    await expect(encryptBackup(Readable.from(['new']), file, key, fingerprint)).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('original')
  })

  it.each(['wrong-key', 'ciphertext', 'tag', 'header', 'truncated'])('rejects %s before restore is permitted', async mode => {
    const file = join(await scratch(), 'test.dsbackup')
    await encryptBackup(Readable.from(['SELECT 1;']), file, key, fingerprint)
    const bytes = await readFile(file)
    if (mode === 'ciphertext') bytes[bytes.length - 20]! ^= 1
    if (mode === 'tag') bytes[bytes.length - 1]! ^= 1
    if (mode === 'header') { const pos = bytes.indexOf(fingerprint); bytes[pos] = 'b'.charCodeAt(0) }
    await writeFile(file, mode === 'truncated' ? bytes.subarray(0, bytes.length - 10) : bytes)
    await expect(decryptBackup(file, mode === 'wrong-key' ? Buffer.alloc(32, 8) : key)).rejects.toThrow()
  })

  it('removes incomplete output when source errors or is empty', async () => {
    const folder = await scratch()
    for (const create of [() => Readable.from([]), () => createReadStream(join(folder, 'absent.sql'))]) {
      const file = join(folder, 'partial.dsbackup')
      await expect(encryptBackup(create(), file, key, fingerprint)).rejects.toThrow()
      await expect(stat(file)).rejects.toThrow()
    }
  })

  it('bounds decompression and does not contact a database for verification', async () => {
    const file = join(await scratch(), 'test.dsbackup')
    await encryptBackup(Readable.from(['x'.repeat(1024)]), file, key, fingerprint)
    await expect(decryptBackup(file, key, undefined, 10)).rejects.toThrow()
    expect(await runBackupCommand(['verify', '--input', file], { DS_BACKUP_ENCRYPTION_KEY: key.toString('hex') })).toMatchObject({ status: 'PASS', databaseOpened: false, restored: false })
  })
})

describe('backup operator boundaries', () => {
  it('requires an independent 32-byte hexadecimal key', () => {
    for (const value of ['', 'password', 'g'.repeat(64), 'a'.repeat(63)]) expect(() => backupKey(value)).toThrow()
    expect(backupKey('a'.repeat(64))).toHaveLength(32)
  })
  it('rejects remote, system, root-user, and malformed restore destinations', () => {
    for (const value of ['mysql://user:pass@db.example.com/ds_restore_test', 'mysql://user:pass@localhost/production', 'mysql://root:pass@localhost/ds_restore_test', 'https://user:pass@localhost/ds_restore_test', 'mysql://user:pass@localhost/ds_restore_test?x=1#fragment']) expect(() => parseDatabaseUrl(value, 'restore')).toThrow()
    expect(parseDatabaseUrl('mysql://restore:pass@127.0.0.1:3307/ds_restore_drill', 'restore').pathname).toBe('/ds_restore_drill')
  })
  it('escapes option-file credentials and requires TLS identity for remote backups', () => {
    const remote = parseDatabaseUrl('mysql://operator:p%22%0Aevil%3Dtrue@db.example.com/ds', 'backup')
    const config = mysqlDefaults(remote)
    expect(config).toContain('ssl-mode=VERIFY_IDENTITY')
    expect(config).not.toContain('\nevil=true')
    expect(databaseFingerprint(remote)).toBe(databaseFingerprint(new URL('mysql://different:secret@db.example.com/ds')))
  })
  it('rejects backups in the repository and refuses accidental invocation', async () => {
    expect(() => validateBackupPath(new URL('../test.dsbackup', import.meta.url).pathname)).toThrow()
    expect(() => validateBackupPath('relative.dsbackup')).toThrow()
    await expect(runBackupCommand(['restore-drill', '--input', '/tmp/a.dsbackup'], {})).rejects.toThrow()
    await expect(runBackupCommand(['snapshot', '--output', '/tmp/a.dsbackup'], { DATABASE_URL: 'mysql://secret@production/live' })).rejects.toThrow('backup_key_invalid')
  })
})
