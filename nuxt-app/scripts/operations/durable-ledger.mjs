import Database from 'better-sqlite3'
import { constants, closeSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const repository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'))
const inside = (root, path) => path === root || path.startsWith(`${root}${sep}`)
const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

/** Dedicated operator-owned directory, never application storage or a Git checkout. */
export function privateDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || path === '/' || inside(repository, path)) throw new Error('ops_directory_invalid')
  // Parent must already exist. Reject symlink aliases for the final directory.
  const parent = realpathSync(dirname(path))
  if (inside(repository, parent)) throw new Error('ops_directory_invalid')
  try { mkdirSync(path, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
  const info = lstatSync(path)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) throw new Error('ops_directory_not_private')
  const canonical = realpathSync(path)
  if (inside(repository, canonical)) throw new Error('ops_directory_invalid')
  return canonical
}

function privateFile(path) {
  try { closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) throw new Error('ops_ledger_not_private')
}

/** One local persistent disk per runner. Not an application queue or a shared/NFS database. */
export function openLedger(directory) {
  const path = resolve(privateDirectory(directory), 'operations.sqlite')
  privateFile(path)
  const db = new Database(path, { timeout: 5000 })
  db.pragma('journal_mode = DELETE')
  db.pragma('synchronous = FULL')
  db.exec(`CREATE TABLE IF NOT EXISTS jobs (
    key TEXT PRIMARY KEY, scope TEXT NOT NULL, token TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('claimed','completed','acknowledged')),
    started TEXT NOT NULL, finished TEXT, receipt TEXT
  ); CREATE UNIQUE INDEX IF NOT EXISTS one_active_scope ON jobs(scope) WHERE state='claimed';`)
  function checkpoint(claim, receipt, finish) {
    const json = JSON.stringify(receipt)
    if (json.length > 16384) throw new Error('ops_receipt_too_large')
    const result = db.prepare('UPDATE jobs SET receipt=?, state=?, finished=? WHERE key=? AND token=? AND state=?')
      .run(json, finish ? 'completed' : 'claimed', finish ? new Date().toISOString() : null, claim.key, claim.token, 'claimed')
    if (result.changes !== 1) throw new Error('ops_claim_lost')
  }
  return {
    claim(scope, key, now) {
      if (!id(scope) || !id(key) || !Number.isFinite(Date.parse(now))) throw new Error('ops_claim_invalid')
      const token = randomBytes(32).toString('hex')
      const result = db.prepare('INSERT OR IGNORE INTO jobs(key,scope,token,state,started) VALUES(?,?,?,?,?)').run(key, scope, token, 'claimed', now)
      return result.changes === 1 ? { key, token } : null
    },
    checkpoint: (claim, receipt) => checkpoint(claim, receipt, false),
    complete: (claim, receipt) => checkpoint(claim, receipt, true),
    latest(scope) {
      const row = db.prepare("SELECT started,state,receipt FROM jobs WHERE scope=? AND state!='claimed' ORDER BY rowid DESC LIMIT 1").get(scope)
      return row ? { ...row, receipt: row.receipt ? JSON.parse(row.receipt) : null } : null
    },
    status() {
      return db.prepare('SELECT key,state,started,finished FROM jobs ORDER BY rowid DESC LIMIT 100').all()
    },
    inspectScope(scope) {
      const active = db.prepare("SELECT started FROM jobs WHERE scope=? AND state='claimed'").get(scope)
      const success = db.prepare("SELECT receipt FROM jobs WHERE scope=? AND state='completed' ORDER BY rowid DESC LIMIT 1").get(scope)
      return { activeSince: active?.started || null, lastCompleted: success ? JSON.parse(success.receipt) : null }
    },
    acknowledge(key) {
      if (!id(key)) throw new Error('ops_job_invalid')
      // Acknowledgement never means delivery/backup succeeded; it only unlocks future jobs.
      return db.prepare("UPDATE jobs SET state='acknowledged',finished=? WHERE key=? AND state='claimed'").run(new Date().toISOString(), key).changes === 1
    },
    close: () => db.close(),
  }
}
