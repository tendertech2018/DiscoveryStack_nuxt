import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createError, createRouter, defineEventHandler, send, sendRedirect, setHeader, setResponseStatus, toWebHandler, type EventHandler } from 'h3'
import { resetSimpleLoginRateLimitsForTests } from '../server/utils/ownerSimpleLogin'
import { PUBLIC_REQUEST_BODY_MAX_BYTES } from '../server/utils/publicRequestGuard'

const seams = vi.hoisted(() => ({
  setOwnerSession: vi.fn(),
  storeLead: vi.fn(),
  analysePublicHomepage: vi.fn(),
}))

vi.mock('../server/utils/auth', () => ({ setOwnerSession: seams.setOwnerSession }))
vi.mock('../server/utils/lead', () => ({ storeLead: seams.storeLead }))
vi.mock('../server/utils/publicSiteAnalysis', () => ({ analysePublicHomepage: seams.analysePublicHomepage }))

const ORIGIN = 'https://public-ingress.test'
let ownerLogin: EventHandler
let leads: EventHandler
let siteAnalysis: EventHandler
let resetSiteAnalysisRateLimitsForTests: () => void

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('setHeader', setHeader)
  vi.stubGlobal('setResponseStatus', setResponseStatus)
  vi.stubGlobal('sendRedirect', sendRedirect)
  vi.stubGlobal('useRuntimeConfig', () => ({ sessionSecret: 's'.repeat(32) }))
  ownerLogin = (await import('../server/routes/owner-login.post')).default
  leads = (await import('../server/api/leads.post')).default
  const analysisModule = await import('../server/api/site-analysis.post')
  siteAnalysis = analysisModule.default
  resetSiteAnalysisRateLimitsForTests = analysisModule.resetSiteAnalysisRateLimitsForTests
})

beforeEach(() => {
  vi.clearAllMocks()
  resetSimpleLoginRateLimitsForTests()
  resetSiteAnalysisRateLimitsForTests()
  vi.stubEnv('OWNER_SIMPLE_LOGIN_ENABLED', 'true')
  vi.stubEnv('OWNER_SIMPLE_LOGIN_PASSWORD', 'p'.repeat(32))
  vi.stubEnv('OWNER_OPEN_ID', 'existing-admin')
  vi.stubEnv('NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN', ORIGIN)
  seams.storeLead.mockResolvedValue({ received: true, duplicate: false })
  seams.analysePublicHomepage.mockResolvedValue({ scope: 'public_homepage_only', scores: { overall: 70 } })
})

afterEach(() => {
  resetSimpleLoginRateLimitsForTests()
  resetSiteAnalysisRateLimitsForTests()
  vi.unstubAllEnvs()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function http(peerAddress?: string) {
  const app = createApp({
    debug: false,
    onError: async (error, event) => {
      setResponseStatus(event, error.statusCode || 500, error.statusMessage)
      await send(event, JSON.stringify({ statusCode: error.statusCode || 500, statusMessage: error.statusMessage || 'Request failed.' }), 'application/json')
    },
  })
  if (peerAddress) app.use(defineEventHandler(event => { event.context.clientAddress = peerAddress }))
  const router = createRouter()
  router.post('/owner-login', ownerLogin)
  router.post('/api/leads', leads)
  router.post('/api/site-analysis', siteAnalysis)
  app.use(router)
  const web = toWebHandler(app)
  return (path: string, raw: string, contentType: string, headers: Record<string, string> = {}) => web(new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body: raw,
  }))
}

describe('bounded public ingress routes', () => {
  it('rejects an oversized chunked owner form as HTML before creating a session', async () => {
    const response = await http()('/owner-login', `password=${'x'.repeat(PUBLIC_REQUEST_BODY_MAX_BYTES)}`, 'application/x-www-form-urlencoded', {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'transfer-encoding': 'chunked',
    })
    expect(response.status).toBe(413)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('登入資料過大')
    expect(seams.setOwnerSession).not.toHaveBeenCalled()
  })

  it('preserves native form parsing for a legal maximal password and rejects duplicates', async () => {
    const password = `${'密'.repeat(1_365)}a`
    expect(Buffer.byteLength(password, 'utf8')).toBe(4_096)
    vi.stubEnv('OWNER_SIMPLE_LOGIN_PASSWORD', password)
    const accepted = await http()('/owner-login', new URLSearchParams({ password }).toString(), 'application/x-www-form-urlencoded', {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
    })
    expect(accepted.status).toBe(302)
    expect(accepted.headers.get('location')).toBe('/audit-lab')
    expect(seams.setOwnerSession).toHaveBeenCalledTimes(1)

    seams.setOwnerSession.mockClear()
    const shortPassword = 'p'.repeat(32)
    vi.stubEnv('OWNER_SIMPLE_LOGIN_PASSWORD', shortPassword)
    const duplicate = await http()('/owner-login', `password=${shortPassword}&password=${shortPassword}`, 'application/x-www-form-urlencoded', {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
    })
    expect(duplicate.status).toBe(401)
    expect(seams.setOwnerSession).not.toHaveBeenCalled()
  })

  it('keeps malformed owner credentials on the existing 401 HTML contract', async () => {
    const response = await http()('/owner-login', '{malformed-json', 'application/json', { origin: ORIGIN, 'sec-fetch-site': 'same-origin' })
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(seams.setOwnerSession).not.toHaveBeenCalled()
  })

  it('rejects an oversized chunked lead before database storage', async () => {
    const response = await http()('/api/leads', `{}${' '.repeat(PUBLIC_REQUEST_BODY_MAX_BYTES)}`, 'application/json', { 'transfer-encoding': 'chunked' })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ statusMessage: 'Lead request body is too large.' })
    expect(seams.storeLead).not.toHaveBeenCalled()
  })

  it('retains the lead success and validation response contracts', async () => {
    const valid = await http()('/api/leads', JSON.stringify({
      name: 'Rin Chen',
      email: 'RIN@EXAMPLE.COM',
      company: 'Signal Studio',
      packageInterest: 'clarify',
      language: 'zh-hant',
      privacyConsent: true,
    }), 'application/json')
    expect(valid.status).toBe(200)
    expect(await valid.json()).toEqual({ received: true, duplicate: false })
    expect(seams.storeLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: 'rin@example.com' }))

    const invalid = await http()('/api/leads', '{}', 'application/json')
    expect(invalid.status).toBe(422)
    expect(seams.storeLead).toHaveBeenCalledTimes(1)
  })

  it('rejects a site-analysis body larger than its false Content-Length before any fetch', async () => {
    const response = await http()('/api/site-analysis', `{}${' '.repeat(PUBLIC_REQUEST_BODY_MAX_BYTES)}`, 'application/json', { 'content-length': '1' })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ statusMessage: 'Website check request body is too large.' })
    expect(seams.analysePublicHomepage).not.toHaveBeenCalled()
  })

  it('retains the site-analysis success and validation response contracts', async () => {
    const valid = await http()('/api/site-analysis', JSON.stringify({ url: 'https://example.test/' }), 'application/json')
    expect(valid.status).toBe(200)
    expect(await valid.json()).toMatchObject({ scope: 'public_homepage_only' })
    expect(seams.analysePublicHomepage).toHaveBeenCalledWith('https://example.test/')

    const invalid = await http()('/api/site-analysis', JSON.stringify({ url: 'not-a-url' }), 'application/json')
    expect(invalid.status).toBe(422)
    expect(seams.analysePublicHomepage).toHaveBeenCalledTimes(1)
  })

  it.each(['shared proxy', 'absent adapter peer'])('allows more than eight analyses through a %s while rotated headers cannot bypass the 800-call process budget', async (mode) => {
    const request = http(mode === 'shared proxy' ? '10.0.0.7' : undefined)
    const body = JSON.stringify({ url: 'https://example.test/' })
    for (let index = 0; index < 800; index += 1) {
      const response = await request('/api/site-analysis', body, 'application/json', {
        'x-forwarded-for': `198.51.100.${index % 250 + 1}`,
        'x-real-ip': `203.0.113.${index % 250 + 1}`,
        'user-agent': `synthetic-agent-${index}`,
      })
      expect(response.status).toBe(200)
      await response.body?.cancel()
    }
    const blocked = await request('/api/site-analysis', body, 'application/json', {
      'x-forwarded-for': '192.0.2.200',
      'user-agent': 'one-more-synthetic-agent',
    })
    expect(blocked.status).toBe(429)
    expect(seams.analysePublicHomepage).toHaveBeenCalledTimes(800)
  })
})
