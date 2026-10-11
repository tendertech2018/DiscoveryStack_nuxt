import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const guard = resolve(app, 'scripts/operations/offline-network-guard.cjs')
const modes = new Set(['--full', '--tests-only'])
const mode = process.argv[2] || '--full'
if (!modes.has(mode) || process.argv.length > 3) throw new Error('Use --full or --tests-only')
const environment = {
  PATH: process.env.PATH,
  ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
  LANG: 'en_US.UTF-8', TZ: 'UTC', NODE_ENV: 'test', CI: '1',
  NUXT_TELEMETRY_DISABLED: '1', NITRO_PRESET: 'node-server',
  NODE_OPTIONS: `--max-old-space-size=4096 --require=${guard}`,
}
// Allowlist above deliberately omits DATABASE_URL, API credentials and all real-test flags.
const stages = mode === '--full' ? [
  ['typecheck', './node_modules/.bin/nuxt', ['typecheck', '--dotenv', '/dev/null']],
  ['build', './node_modules/.bin/nuxt', ['build', '--dotenv', '/dev/null']],
  ['tests', './node_modules/.bin/vitest', ['run']],
] : [['tests', './node_modules/.bin/vitest', ['run']]]
const results = []
let interrupted = false
let child
const cancel = () => { interrupted = true; child?.kill('SIGTERM') }
process.once('SIGINT', cancel)
process.once('SIGTERM', cancel)
for (const [name, command, args] of stages) {
  if (interrupted) break
  const started = Date.now()
  console.log(`Offline acceptance: ${name}`)
  const outcome = await new Promise(resolveResult => {
    child = spawn(command, args, { cwd: app, env: environment, stdio: 'inherit' })
    child.once('error', () => resolveResult({ code: 1, signal: null }))
    child.once('close', (code, signal) => resolveResult({ code, signal }))
  })
  results.push({ name, passed: outcome.code === 0 && !outcome.signal, durationMs: Date.now() - started, ...outcome })
  if (!results.at(-1).passed) break
}
const passed = !interrupted && results.length === stages.length && results.every(row => row.passed)
const directory = resolve(app, '../work/offline-acceptance')
await mkdir(directory, { recursive: true })
const report = { checkedAt: new Date().toISOString(), scope: 'local_build_and_offline_tests_only', mode, passed, interrupted, productionAcceptance: 'NOT_RUN', realProviders: 'NOT_RUN', inheritedCredentials: false, results }
await writeFile(resolve(directory, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(`Offline acceptance ${passed ? 'PASS' : 'INCOMPLETE'}; production acceptance remains NOT_RUN.`)
process.exitCode = passed ? 0 : 1
