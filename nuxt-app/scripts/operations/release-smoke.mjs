import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validateOrigin(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('origin_invalid') }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) throw new Error('origin_requires_https_or_loopback_http')
  return url.origin
}

async function readJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('response_not_json')
  if (!response.body) throw new Error('response_empty')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > 65536) throw new Error('response_too_large')
      chunks.push(Buffer.from(result.value))
    }
  } finally { await reader.cancel().catch(() => {}) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('response_invalid_json') }
}

export async function runReleaseSmoke({ origin, expectedCommit, fetcher = fetch, timeoutMs = 10000, allowNotReady = false }) {
  const base = validateOrigin(origin)
  if (expectedCommit !== undefined && !/^[a-f0-9]{40}$/i.test(expectedCommit)) throw new Error('expected_commit_requires_full_sha')
  const checks = await Promise.all([
    ['/api/health', 'liveness'], ['/api/ready', 'readiness'], ['/api/__release', 'release'], ['/api/operations/readiness', 'owner_boundary'],
  ].map(async ([path, name]) => {
    try {
      const response = await fetcher(`${base}${path}`, { redirect: 'error', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
      if (name === 'owner_boundary') {
        await response.body?.cancel()
        return { name, status: response.status === 401 && /no-store/i.test(response.headers.get('cache-control') || '') ? 'PASS' : 'FAIL', httpStatus: response.status, reason: response.status === 401 ? null : 'owner_endpoint_must_reject_anonymous' }
      }
      const body = await readJson(response)
      const privateCache = /no-store/i.test(response.headers.get('cache-control') || '')
      const leaked = /mysql:\/\/|postgres:\/\/|Bearer\s|-----BEGIN|sessionSecret|DATABASE_URL|ciphertext|accessToken|password/i.test(JSON.stringify(body))
      let passed = privateCache && !leaked
      let reason = !privateCache ? 'cache_control_missing' : leaked ? 'unexpected_sensitive_fields' : null
      if (name === 'liveness') passed &&= response.status === 200 && body.status === 'ok'
      if (name === 'readiness') passed &&= allowNotReady
        ? (response.status === 200 && body.status === 'ready') || (response.status === 503 && body.status === 'not_ready')
        : response.status === 200 && body.status === 'ready' && body.checks?.database === 'pass' && body.checks?.migrations === 'pass'
      if (name === 'release') {
        passed &&= response.status === 200 && body.handler === 'nitro'
        if (expectedCommit) {
          const commit = body.commit || body.sourceCommit || body.revision
          if (commit !== expectedCommit) { passed = false; reason = 'release_commit_mismatch' }
        }
      }
      return { name, status: passed ? 'PASS' : 'FAIL', httpStatus: response.status, reason: reason || (passed ? null : 'unexpected_probe_result') }
    } catch { return { name, status: 'FAIL', httpStatus: null, reason: 'probe_unavailable' } }
  }))
  return { status: checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL', checkedAt: new Date().toISOString(), expectedCommit: expectedCommit || null, evidenceKind: allowNotReady ? 'local_smoke' : 'deployment_readiness', checks, providerAcceptance: 'NOT_RUN', databaseMutation: false }
}

export function parseArguments(args) {
  const result = { origin: '', expectedCommit: undefined, allowNotReady: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--origin' && args[i + 1]) result.origin = args[++i]
    else if (args[i] === '--expect-commit' && args[i + 1]) result.expectedCommit = args[++i]
    else if (args[i] === '--allow-not-ready-local') result.allowNotReady = true
    else throw new Error('usage_origin_expect_commit_allow_not_ready_local')
  }
  validateOrigin(result.origin)
  if (result.allowNotReady && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(result.origin).hostname)) throw new Error('not_ready_override_requires_loopback')
  if (!result.allowNotReady && !result.expectedCommit) throw new Error('deployment_check_requires_expected_commit')
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => runReleaseSmoke(parseArguments(process.argv.slice(2)))).then(result => {
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.status === 'PASS' ? 0 : 1
  }).catch(error => {
    console.error(JSON.stringify({ status: 'FAIL', reason: /^[a-z_]+$/.test(error.message) ? error.message : 'release_smoke_failed' }))
    process.exitCode = 1
  })
}
