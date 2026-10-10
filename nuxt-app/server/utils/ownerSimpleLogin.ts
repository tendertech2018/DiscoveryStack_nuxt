import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, getHeader, getRequestIP, type H3Event } from 'h3'

/**
 * Temporary password-only owner login for the free hosting deploy.
 *
 * The shipped owner login uses an external OAuth identity provider that is not
 * available on this deployment. This route is an opt-in fallback: it is inert
 * unless explicitly enabled with a strong password and an existing admin
 * identity. It grants the same admin session the rest of the private app
 * already enforces, so it must stay behind the same session-secret and
 * admin-in-database checks.
 *
 * The password is a runtime secret, so it is read from process.env directly
 * (never baked into the serialized runtimeConfig) — mirroring server/utils/auth.ts.
 */
export const OWNER_SIMPLE_LOGIN_PATH = '/owner-login'
export const OWNER_SIMPLE_LOGIN_MIN_PASSWORD_BYTES = 32
const OWNER_SIMPLE_LOGIN_MAX_PASSWORD_BYTES = 4_096
const RATE_LIMIT = 5
const GLOBAL_RATE_LIMIT = 50
const RATE_WINDOW_MS = 15 * 60 * 1_000
const MAX_RATE_BUCKETS = 10_000
const GLOBAL_RATE_BUCKET = 'global'
const attempts = new Map<string, { count: number, startedAt: number }>()

export function simpleLoginEnabled() {
  return process.env.OWNER_SIMPLE_LOGIN_ENABLED === 'true'
}

export function isStrongSimpleLoginPassword(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim()) return false
  const bytes = Buffer.byteLength(value, 'utf8')
  return bytes >= OWNER_SIMPLE_LOGIN_MIN_PASSWORD_BYTES && bytes <= OWNER_SIMPLE_LOGIN_MAX_PASSWORD_BYTES
}

export function configuredSimpleLoginPassword(runtimeSessionSecret = '') {
  const password = process.env.OWNER_SIMPLE_LOGIN_PASSWORD || ''
  const openId = process.env.NUXT_OWNER_OPEN_ID || process.env.OWNER_OPEN_ID || ''
  const sessionSecret = runtimeSessionSecret || process.env.NUXT_SESSION_SECRET || process.env.JWT_SECRET || ''
  const vaultPrimarySecret = process.env.NUXT_PROVIDER_VAULT_KEY || ''
  const separatedFromSession = !sessionSecret || password !== sessionSecret
  const separatedFromVault = !vaultPrimarySecret || password !== vaultPrimarySecret
  return simpleLoginEnabled() && isStrongSimpleLoginPassword(password) && Boolean(openId.trim()) && separatedFromSession && separatedFromVault ? password : ''
}

export function resolveSimpleLoginOpenId() {
  const openId = (process.env.NUXT_OWNER_OPEN_ID || process.env.OWNER_OPEN_ID || '').trim()
  if (!openId) throw createError({ statusCode: 503, statusMessage: 'Temporary owner sign-in is not configured.' })
  return openId
}

export function simpleLoginPasswordMatches(submitted: string, expected: string) {
  if (!expected) return false
  const expectedBytes = Buffer.from(expected, 'utf8')
  if (Buffer.byteLength(String(submitted), 'utf8') > OWNER_SIMPLE_LOGIN_MAX_PASSWORD_BYTES) {
    timingSafeEqual(expectedBytes, expectedBytes)
    return false
  }
  const submittedBytes = Buffer.from(String(submitted), 'utf8')
  // Keep the comparison time independent of whether the lengths match.
  if (submittedBytes.length !== expectedBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes)
    return false
  }
  return timingSafeEqual(submittedBytes, expectedBytes)
}

function pruneExpiredRateBuckets(now: number) {
  if (attempts.size < MAX_RATE_BUCKETS) return
  for (const [key, bucket] of attempts) {
    if (key !== GLOBAL_RATE_BUCKET && now - bucket.startedAt >= RATE_WINDOW_MS) attempts.delete(key)
  }
  if (attempts.size >= MAX_RATE_BUCKETS) throw createError({ statusCode: 429, statusMessage: 'Too many sign-in attempts. Please wait a few minutes and try again.' })
}

function consumeRateBucket(key: string, limit: number, now: number) {
  const bucket = attempts.get(key)
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    attempts.set(key, { count: 1, startedAt: now })
    return
  }
  if (bucket.count >= limit) throw createError({ statusCode: 429, statusMessage: 'Too many sign-in attempts. Please wait a few minutes and try again.' })
  bucket.count += 1
}

/**
 * Use only the transport peer address that H3/Nitro supplies. In particular,
 * do not enable H3's xForwardedFor option here: a direct client can forge that
 * header unless the deployment edge has a separately verified trust policy.
 */
export function ownerLoginRequestFingerprint(event: H3Event) {
  const peerAddress = getRequestIP(event) || 'unknown-peer'
  return createHash('sha256').update(`owner-login-v3\n${peerAddress}`).digest('hex')
}

function configuredPrivateOrigin() {
  const raw = (process.env.NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    const normalizedInput = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || normalizedInput !== url.origin) return null
    return url.origin
  } catch {
    return null
  }
}

/** Browser CSRF boundary for the password fallback; non-browser callers still need the secret. */
export function assertSimpleLoginRequestOrigin(event: H3Event) {
  const expectedOrigin = configuredPrivateOrigin()
  if (!expectedOrigin) throw createError({ statusCode: 503, statusMessage: 'Temporary owner sign-in is not configured.' })
  const origin = getHeader(event, 'origin') || ''
  const fetchSite = getHeader(event, 'sec-fetch-site')
  if (origin !== expectedOrigin || fetchSite && fetchSite !== 'same-origin') {
    throw createError({ statusCode: 403, statusMessage: 'Owner sign-in requires the configured private origin.' })
  }
}

/**
 * Throttle both a direct peer and the whole process. This protects the temporary
 * fallback from header rotation and broad spraying, but is intentionally not
 * presented as a replacement for a shared edge limiter on multi-replica hosts.
 */
export function enforceSimpleLoginRateLimit(fingerprint: string) {
  const now = Date.now()
  pruneExpiredRateBuckets(now)
  consumeRateBucket(GLOBAL_RATE_BUCKET, GLOBAL_RATE_LIMIT, now)
  consumeRateBucket(`peer:${fingerprint || 'unknown'}`, RATE_LIMIT, now)
}

export function clearSimpleLoginRateLimit(fingerprint: string) {
  attempts.delete(`peer:${fingerprint || 'unknown'}`)
}

/** Test seam only; production code never resets failed-attempt history. */
export function resetSimpleLoginRateLimitsForTests() {
  attempts.clear()
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => (
  ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
))

/** Minimal, self-contained sign-in page. No external assets; safe to serve noindex/no-store. */
export function renderOwnerLoginPage(options: { message?: string } = {}) {
  const alert = options.message
    ? `<p class="alert" role="alert">${escapeHtml(options.message)}</p>`
    : ''
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Owner 登入 · DiscoveryStack</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
  .card { width: 100%; max-width: 360px; background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 28px; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
  label { display: block; font-size: 13px; margin: 0 0 6px; color: #cbd5e1; }
  input { width: 100%; padding: 12px 14px; font-size: 16px; border-radius: 10px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; }
  input:focus { outline: 2px solid #38bdf8; border-color: #38bdf8; }
  button { width: 100%; margin-top: 16px; padding: 12px 14px; font-size: 15px; font-weight: 600; border: none; border-radius: 10px; background: #38bdf8; color: #082f49; cursor: pointer; }
  button:hover { background: #7dd3fc; }
  .alert { margin: 0 0 16px; padding: 10px 12px; font-size: 13px; border-radius: 8px; background: #7f1d1d; color: #fee2e2; }
</style>
</head>
<body>
  <main class="card">
    <h1>Owner 登入</h1>
    <p class="sub">私有稽核實驗室。輸入密碼即可進入。</p>
    ${alert}
    <form method="post" action="${OWNER_SIMPLE_LOGIN_PATH}" autocomplete="off">
      <label for="password">密碼</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">登入</button>
    </form>
  </main>
</body>
</html>`
}
