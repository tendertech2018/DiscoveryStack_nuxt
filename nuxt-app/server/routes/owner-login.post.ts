import type { H3Event } from 'h3'
import { setOwnerSession } from '../utils/auth'
import {
  assertSimpleLoginRequestOrigin,
  clearSimpleLoginRateLimit,
  configuredSimpleLoginPassword,
  enforceSimpleLoginRateLimit,
  ownerLoginRequestFingerprint,
  renderOwnerLoginPage,
  resolveSimpleLoginOpenId,
  simpleLoginPasswordMatches,
} from '../utils/ownerSimpleLogin'

function htmlResponse(event: H3Event, status: number, message?: string) {
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  setResponseStatus(event, status)
  return renderOwnerLoginPage(message ? { message } : {})
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  const runtime = useRuntimeConfig(event)
  const expected = configuredSimpleLoginPassword(typeof runtime.sessionSecret === 'string' ? runtime.sessionSecret : '')
  if (!expected) return htmlResponse(event, 503, '臨時 Owner 登入未啟用，或安全設定不完整。')

  assertSimpleLoginRequestOrigin(event)
  const fingerprint = ownerLoginRequestFingerprint(event)
  enforceSimpleLoginRateLimit(fingerprint)

  const body = await readBody(event).catch(() => null)
  const rawPassword = body && typeof body === 'object' ? (body as Record<string, unknown>).password : undefined
  const submitted = typeof rawPassword === 'string' ? rawPassword : ''

  if (!simpleLoginPasswordMatches(submitted, expected)) {
    return htmlResponse(event, 401, '密碼不正確，請再試一次。')
  }

  const openId = resolveSimpleLoginOpenId()
  // A fallback password must never create or elevate authority. The configured
  // identity has to exist as an admin already; setOwnerSession enforces that
  // durable allowlist immediately before signing the cookie.
  await setOwnerSession(event, { openId, name: 'Owner' })
  clearSimpleLoginRateLimit(fingerprint)

  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  return sendRedirect(event, '/audit-lab', 302)
})
