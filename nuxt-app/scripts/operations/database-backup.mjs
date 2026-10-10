import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { backupDigest, backupKey, databaseFingerprint, decryptBackup, encryptBackup } from './encrypted-backup.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const MAX_RUN_MS = 30 * 60 * 1000
const localHost = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)

export function parseDatabaseUrl(value, purpose) {
  let url
  try { url = new URL(value) } catch { throw new Error('database_configuration_invalid') }
  if (url.protocol !== 'mysql:' || !url.hostname || !url.username || !/^\/[a-zA-Z0-9_]+$/.test(url.pathname) || url.hash) throw new Error('database_configuration_invalid')
  if (purpose === 'restore' && (!localHost(url.hostname) || !/^\/ds_restore_[a-zA-Z0-9_]+$/.test(url.pathname) || decodeURIComponent(url.username) === 'root')) throw new Error('restore_requires_loopback_empty_ds_restore_database_and_scoped_user')
  return url
}

export function mysqlDefaults(url, ca = '') {
  const quote = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
  const fields = ['[client]', 'protocol=tcp', `host=${quote(url.hostname.replace(/^\[|\]$/g, ''))}`, `port=${url.port || '3306'}`, `user=${quote(decodeURIComponent(url.username))}`, `password=${quote(decodeURIComponent(url.password))}`, 'default-character-set=utf8mb4']
  if (!localHost(url.hostname)) {
    fields.push('ssl-mode=VERIFY_IDENTITY')
    if (ca) {
      if (!isAbsolute(ca) || /[\r\n]/.test(ca)) throw new Error('backup_ca_path_invalid')
      fields.push(`ssl-ca=${quote(ca)}`)
    }
  }
  return `${fields.join('\n')}\n[mysql]\nconnect-timeout=10\n`
}

export function validateBackupPath(value) {
  if (!value || !isAbsolute(value) || !value.endsWith('.dsbackup')) throw new Error('backup_requires_absolute_dsbackup_path')
  const path = resolve(value)
  const rel = relative(repoRoot, path)
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) throw new Error('backup_must_be_outside_repository')
  return path
}

function childProcess(binary, args) {
  // Credentials are in a 0600 option file, never argv or inherited application env.
  const child = spawn(binary, args, { env: { PATH: process.env.PATH, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stderr.resume()
  const timer = setTimeout(() => child.kill('SIGKILL'), MAX_RUN_MS)
  const completion = new Promise((ok, reject) => {
    child.once('error', () => reject(new Error('mysql_client_unavailable')))
    child.once('close', code => code === 0 ? ok() : reject(new Error('mysql_command_failed')))
  }).finally(() => clearTimeout(timer))
  completion.catch(() => {})
  return { child, completion }
}

async function runSql(defaults, database, sql) {
  const { child, completion } = childProcess('mysql', [`--defaults-file=${defaults}`, '--no-login-paths', '--batch', '--skip-column-names', `--database=${database}`])
  let output = ''
  child.stdout.on('data', chunk => {
    output += chunk.toString('utf8')
    if (output.length > 65536) child.kill('SIGKILL')
  })
  child.stdin.on('error', () => {})
  child.stdin.end(sql)
  await completion
  return output.trim()
}

export async function runBackupCommand(args, env = process.env) {
  const [command, ...options] = args
  const expected = command === 'snapshot' ? ['--output'] : command === 'verify' ? ['--input'] : command === 'restore-drill' ? ['--input', '--confirm-isolated-restore'] : []
  if (!expected.length || options.some((item, i) => item.startsWith('--') && !expected.includes(item)) || options.length !== (command === 'restore-drill' ? 3 : 2)) throw new Error('usage_snapshot_output_verify_input_or_restore_drill_input_confirm_isolated_restore')
  const flag = command === 'snapshot' ? '--output' : '--input'
  const index = options.indexOf(flag)
  if (index < 0 || !options[index + 1] || options[index + 1].startsWith('--')) throw new Error('backup_path_required')
  const requestedPath = validateBackupPath(options[index + 1])
  const path = validateBackupPath(join(await realpath(dirname(requestedPath)), requestedPath.split(sep).at(-1)))
  const key = backupKey(env.DS_BACKUP_ENCRYPTION_KEY)
  if (command === 'verify') {
    const verified = await decryptBackup(path, key)
    return { status: 'PASS', command, authenticated: true, plaintextBytes: verified.plaintextBytes, ...await backupDigest(path), databaseOpened: false, restored: false }
  }
  const url = parseDatabaseUrl(command === 'snapshot' ? env.DS_BACKUP_DATABASE_URL : env.DS_RESTORE_DATABASE_URL, command === 'snapshot' ? 'backup' : 'restore')
  if (command === 'restore-drill' && !options.includes('--confirm-isolated-restore')) throw new Error('restore_confirmation_required')
  const scratch = await mkdtemp(join(tmpdir(), 'ds-database-backup-'))
  await chmod(scratch, 0o700)
  try {
    const defaults = join(scratch, 'client.cnf')
    await writeFile(defaults, mysqlDefaults(url, env.DS_BACKUP_SSL_CA), { mode: 0o600, flag: 'wx' })
    const database = url.pathname.slice(1)
    if (command === 'snapshot') {
      // This tool covers the application's transactional tables, not arbitrary
      // stored code. Refuse unsupported objects instead of silently omitting them.
      const unsupported = await runSql(defaults, database, "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_type <> 'BASE TABLE' OR engine <> 'InnoDB')) + (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = DATABASE()) + (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = DATABASE()) + (SELECT COUNT(*) FROM information_schema.events WHERE event_schema = DATABASE());")
      if (unsupported !== '0') throw new Error('backup_unsupported_database_objects')
      const { child, completion } = childProcess('mysqldump', [`--defaults-file=${defaults}`, '--no-login-paths', '--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', '--skip-add-drop-table', '--skip-triggers', '--routines=false', '--events=false', database])
      child.stdin.end()
      const writing = encryptBackup(child.stdout, path, key, databaseFingerprint(url))
      try { await Promise.all([completion, writing]) }
      catch (error) {
        child.kill('SIGKILL')
        await Promise.allSettled([completion, writing])
        // Only remove a file this invocation actually created, never a pre-existing backup.
        if ((await Promise.allSettled([writing]))[0].status === 'fulfilled') await rm(path, { force: true })
        throw error
      }
      await decryptBackup(path, key)
      return { status: 'PASS', command, authenticated: true, ...await backupDigest(path), databaseOpened: true, restored: false, offsiteCopied: false }
    }
    const verified = await decryptBackup(path, key)
    if (verified.sourceFingerprint === databaseFingerprint(url)) throw new Error('restore_source_target_match')
    const count = await runSql(defaults, database, 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();')
    if (count !== '0') throw new Error('restore_target_not_empty')
    const sqlFile = join(scratch, 'authenticated.sql')
    await decryptBackup(path, key, createWriteStream(sqlFile, { flags: 'wx', mode: 0o600 }))
    const { child, completion } = childProcess('mysql', [`--defaults-file=${defaults}`, '--no-login-paths', '--binary-mode', `--database=${database}`])
    child.stdout.resume()
    try { await Promise.all([pipeline(createReadStream(sqlFile), child.stdin), completion]) }
    catch (error) { child.kill('SIGKILL'); throw error }
    const restoredTables = Number(await runSql(defaults, database, 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();'))
    if (!Number.isSafeInteger(restoredTables) || restoredTables < 1) throw new Error('restore_has_no_tables')
    return { status: 'PASS', command, authenticated: true, ...await backupDigest(path), databaseOpened: true, restored: true, restoredTables, destination: 'isolated_loopback_database', productionRestore: false }
  } finally { await rm(scratch, { recursive: true, force: true }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBackupCommand(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(error => {
    const safe = /^[a-z_]+$/.test(error.message) ? error.message : 'backup_operation_failed'
    console.error(JSON.stringify({ status: 'FAIL', reason: safe }))
    process.exitCode = 1
  })
}
