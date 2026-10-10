import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createError, createRouter, send, setResponseStatus, toWebHandler } from 'h3'

const seams = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  optimise: vi.fn(),
  adapter: vi.fn(),
  fetch: vi.fn(),
  database: vi.fn(),
}))

vi.mock('../server/utils/auth', () => ({ requireOwner: seams.requireOwner }))
vi.mock('../server/geo/optimise', () => ({ optimiseGeoDocument: seams.optimise }))
vi.mock('../server/database', () => ({ getDatabase: seams.database }))
vi.mock('../server/geo/bounded-preview', async importOriginal => {
  const actual = await importOriginal<typeof import('../server/geo/bounded-preview')>()
  return { ...actual, createBoundedQwenPreviewAdapter: seams.adapter }
})
vi.mock('../server/utils/bounded-request-body', async importOriginal => {
  const actual = await importOriginal<typeof import('../server/utils/bounded-request-body')>()
  return { ...actual, readBoundedRequestBody: vi.fn(actual.readBoundedRequestBody) }
})

import handler from '../server/api/geo/optimise.post'
import { BoundedQwenPreviewError, type BoundedQwenPreviewErrorCode } from '../server/geo/bounded-preview'
import { readBoundedRequestBody } from '../server/utils/bounded-request-body'

const ORIGIN = 'https://geo-preview.test'
const BODY_LIMIT = 64 * 1024
const source = { title: 'Public service overview', content: 'This public page explains the service and its review process.', language: 'en' }
const boundedBody = { ...source, mode: 'bounded-qwen-preview', confirmedPublicContent: true }
const explicitAdapter = { id: 'synthetic-bounded-adapter', version: 'test-only', rewrite: vi.fn() }
const result = { version: 'synthetic-preview', candidate: { optimizedContent: source.content, provenance: { providerExecution: true } } }

function http(raw: string, headers: Record<string, string> = {}) {
  const app = createApp({
    debug: false,
    onError: async (error, event) => {
      setResponseStatus(event, error.statusCode || 500)
      await send(event, JSON.stringify({ statusCode: error.statusCode || 500, message: error.message, data: error.data }), 'application/json')
    },
  })
  const router = createRouter()
  router.post('/api/geo/optimise', handler)
  app.use(router)
  return toWebHandler(app)(new Request(`${ORIGIN}/api/geo/optimise`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  }))
}

function post(body: unknown) { return http(JSON.stringify(body)) }

function expectNoExecution() {
  expect(seams.adapter).not.toHaveBeenCalled()
  expect(seams.optimise).not.toHaveBeenCalled()
}

beforeEach(() => {
  seams.requireOwner.mockReset().mockResolvedValue({ openId: 'synthetic-owner' })
  seams.optimise.mockReset().mockResolvedValue(result)
  seams.adapter.mockReset().mockReturnValue(explicitAdapter)
  seams.fetch.mockReset().mockImplementation(() => { throw new Error('Unexpected external network in route test.') })
  seams.database.mockReset().mockImplementation(() => { throw new Error('Unexpected database access in route test.') })
  vi.mocked(readBoundedRequestBody).mockClear()
  vi.stubGlobal('fetch', seams.fetch)
})

afterEach(() => {
  expect(seams.fetch).not.toHaveBeenCalled()
  expect(seams.database).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('owner-only bounded GEO preview route', () => {
  it.each([401, 403])('requires owner authority before parsing even an oversized request (%s)', async statusCode => {
    seams.requireOwner.mockRejectedValueOnce(createError({ statusCode, message: 'Owner required.' }))
    const response = await http('x'.repeat(BODY_LIMIT + 1))
    expect(response.status).toBe(statusCode)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(seams.requireOwner).toHaveBeenCalledOnce()
    expect(readBoundedRequestBody).not.toHaveBeenCalled()
    expectNoExecution()
  })

  it('keeps absent mode on the legacy path without constructing a paid-preview adapter', async () => {
    const response = await post(source)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(result)
    expect(seams.optimise.mock.calls).toEqual([[source]])
    expect(seams.adapter).not.toHaveBeenCalled()
    expect(seams.requireOwner.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(readBoundedRequestBody).mock.invocationCallOrder[0]!)
    expect(readBoundedRequestBody).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ maxBytes: BODY_LIMIT, invalidStatusCode: 400 }))
  })

  it.each(['future-preview', '', null, false, 1, {}, []])('rejects unsupported mode %j without falling back', async mode => {
    const response = await post({ ...source, mode, confirmedPublicContent: true })
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expectNoExecution()
  })

  it.each([undefined, false, 'true', 1, null, {}, []])('requires exact boolean public-content confirmation, not %j', async confirmedPublicContent => {
    const response = await post({ ...boundedBody, confirmedPublicContent })
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expectNoExecution()
  })

  it.each([null, [], 'text', {}, { ...source, title: 4 }, { ...source, content: {} }, { ...source, language: 'zh' }])('rejects invalid document shape %j before adapter creation', async body => {
    const response = await post(body)
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expectNoExecution()
  })

  it('rejects malformed JSON before adapter creation', async () => {
    const response = await http('{broken-json')
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expectNoExecution()
  })

  it.each([
    { 'content-length': '1' },
    { 'transfer-encoding': 'chunked' },
  ] as Record<string, string>[])('counts actual UTF-8 bytes rather than trusting ingress headers %j', async headers => {
    const raw = JSON.stringify({ ...boundedBody, content: '界'.repeat(22_000) })
    expect(raw.length).toBeLessThan(BODY_LIMIT)
    expect(Buffer.byteLength(raw, 'utf8')).toBeGreaterThan(BODY_LIMIT)
    const response = await http(raw, headers)
    expect(response.status).toBe(413)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expectNoExecution()
  })

  it('accepts exactly 64 KiB and rejects one byte more before any execution', async () => {
    const json = JSON.stringify(boundedBody)
    const raw = json + ' '.repeat(BODY_LIMIT - Buffer.byteLength(json, 'utf8'))
    expect(Buffer.byteLength(raw, 'utf8')).toBe(BODY_LIMIT)
    const accepted = await http(raw)
    expect(accepted.status).toBe(200)
    expect(seams.optimise).toHaveBeenCalledOnce()
    seams.adapter.mockClear()
    seams.optimise.mockClear()
    const oversized = await http(`${raw} `)
    expect(oversized.status).toBe(413)
    expectNoExecution()
  })

  it.each(['en', 'zh-hant'])('passes only source fields and an explicit server adapter for %s', async language => {
    const input = { ...source, language }
    const response = await post({
      ...boundedBody,
      language,
      endpoint: 'https://attacker.invalid/v1',
      apiKey: 'synthetic-client-secret-must-not-pass',
      model: 'other-model',
      provider: 'gemini',
      budgetUsd: 999,
      max_tokens: 99_999,
      enable_thinking: true,
      approvedEvidenceContext: 'unapproved client evidence',
      selectedRules: ['invented-rule'],
      publish: true,
      train: true,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(result)
    expect(seams.adapter.mock.calls).toEqual([[]])
    expect(seams.optimise.mock.calls).toEqual([[input, explicitAdapter]])
  })

  it('constructs a fresh per-request adapter rather than reusing a spent one', async () => {
    const secondAdapter = { ...explicitAdapter, version: 'second-synthetic-adapter' }
    seams.adapter.mockReturnValueOnce(explicitAdapter).mockReturnValueOnce(secondAdapter)
    expect((await post(boundedBody)).status).toBe(200)
    expect((await post(boundedBody)).status).toBe(200)
    expect(seams.adapter.mock.calls).toEqual([[], []])
    expect(seams.optimise.mock.calls).toEqual([[source, explicitAdapter], [source, secondAdapter]])
  })

  it.each([
    ['CONFIGURATION', 503], ['ALREADY_USED', 409], ['REQUEST_TOO_LARGE', 413], ['TIMEOUT', 504],
    ['TRANSPORT', 502], ['UNAUTHORIZED', 502], ['RATE_LIMITED', 502], ['UPSTREAM', 502],
    ['RESPONSE_TOO_LARGE', 502], ['MALFORMED_RESPONSE', 502], ['MODEL_MISMATCH', 502],
    ['TRUNCATED_RESPONSE', 502], ['USAGE_INVALID', 502], ['BUDGET_EXCEEDED', 502],
    ['THINKING_NOT_DISABLED', 502], ['UNSAFE_OUTPUT', 502], ['UNKNOWN', 502],
  ] as [BoundedQwenPreviewErrorCode, number][])('maps %s to safe HTTP %s without retry or legacy fallback', async (code, statusCode) => {
    const failure = new BoundedQwenPreviewError(code)
    failure.message = 'synthetic-provider-secret-and-source-must-not-leak'
    seams.optimise.mockRejectedValueOnce(failure)
    const response = await post(boundedBody)
    expect(response.status).toBe(statusCode)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const payload = await response.json()
    expect(payload.data).toEqual({ code, retryable: false })
    expect(payload.message).toContain('不要直接重送')
    expect(JSON.stringify(payload)).not.toContain(failure.message)
    expect(seams.adapter.mock.calls).toEqual([[]])
    expect(seams.optimise.mock.calls).toEqual([[source, explicitAdapter]])
  })

  it('sanitizes an adapter construction failure before any optimization call', async () => {
    seams.adapter.mockImplementationOnce(() => { throw new BoundedQwenPreviewError('CONFIGURATION') })
    const response = await post(boundedBody)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ data: { code: 'CONFIGURATION', retryable: false } })
    expect(seams.adapter).toHaveBeenCalledOnce()
    expect(seams.optimise).not.toHaveBeenCalled()
  })

  it.each([
    new Error('synthetic-provider-secret-must-not-leak'),
    { statusCode: 503, message: 'synthetic-provider-secret-must-not-leak', data: { upstreamBody: 'synthetic-private-source' } },
    'synthetic-provider-secret-must-not-leak',
    null,
  ])('sanitizes unexpected bounded failures without retry', async failure => {
    seams.optimise.mockRejectedValueOnce(failure)
    const response = await post(boundedBody)
    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const payload = await response.json()
    expect(payload.data).toEqual({ retryable: false })
    expect(JSON.stringify(payload)).not.toMatch(/synthetic-provider-secret|synthetic-private-source|upstreamBody/)
    expect(seams.optimise.mock.calls).toEqual([[source, explicitAdapter]])
  })

  it('preserves an optimizer input-validation 400 without a second attempt', async () => {
    seams.optimise.mockRejectedValueOnce(createError({ statusCode: 400, message: '原文必須介於 1 至 12,000 個字元。' }))
    const response = await post(boundedBody)
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ message: '原文必須介於 1 至 12,000 個字元。' })
    expect(seams.optimise.mock.calls).toEqual([[source, explicitAdapter]])
  })
})
