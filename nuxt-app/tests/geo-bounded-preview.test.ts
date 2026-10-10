import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOUNDED_QWEN_PREVIEW_LIMITS,
  BoundedQwenPreviewError,
  createBoundedQwenPreviewAdapter,
} from '../server/geo/bounded-preview'
import { buildOfficialAutoGeoPrompt } from '../server/geo/autogeo-api'
import { optimiseGeoDocument } from '../server/geo/optimise'
import type { OpenAiCompatibleProviderConfiguration } from '../server/llm-provider/openai-compatible'

const document = { title: 'DiscoveryStack 內容說明', content: 'DiscoveryStack 整理網站內容、可驗證證據與人工審閱流程。', language: 'zh-hant' as const }
const configuration = () => ({
  configured: true as const,
  endpoint: 'https://ws-preview.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.6-plus',
  apiKey: 'fixture-secret-never-log',
  providerLabel: 'bailian' as const,
  source: 'llm' as const,
})
const envelope = () => ({
  model: 'qwen3.6-plus',
  choices: [{ index: 0, message: { role: 'assistant', content: document.content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
})
const responseFor = (value: unknown = envelope()) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
const providerFetch = (value: unknown = envelope()) => vi.fn<typeof fetch>().mockImplementation(async () => responseFor(value))
const create = (fetchImpl: typeof fetch) => createBoundedQwenPreviewAdapter({ configuration: configuration(), fetchImpl })

describe('bounded single-provider Qwen preview', () => {
  beforeEach(() => {
    for (const name of ['NUXT_LLM_ENDPOINT', 'NUXT_LLM_API_KEY', 'NUXT_LLM_MODEL', 'NUXT_GEOFLOW_QWEN_ENDPOINT', 'NUXT_GEOFLOW_QWEN_API_KEY', 'NUXT_GEOFLOW_QWEN_MODEL', 'NUXT_AUTOGEO_BAILIAN_ENDPOINT', 'NUXT_AUTOGEO_BAILIAN_API_KEY', 'NUXT_AUTOGEO_BAILIAN_MODEL', 'NUXT_AUTOGEO_GEMINI_API_KEY']) vi.stubEnv(name, '')
    vi.stubGlobal('useRuntimeConfig', () => ({}))
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected global provider call') }))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it.each(['qwen3.6-plus', 'qwen3.6-plus-2026-04-02'])('makes one bounded request and accepts the exact returned model %s', async model => {
    const payload = { ...envelope(), model }
    const fetchMock = providerFetch(payload)
    const candidate = await create(fetchMock).rewrite(document, [])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://ws-preview.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions')
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request).toMatchObject({ method: 'POST', redirect: 'error', headers: { authorization: 'Bearer fixture-secret-never-log' } })
    expect(request?.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(String(request?.body))
    expect(Object.keys(body).sort()).toEqual(['enable_thinking', 'max_tokens', 'messages', 'model', 'stream'])
    expect(body).toMatchObject({ model: 'qwen3.6-plus', stream: false, max_tokens: 2048, enable_thinking: false })
    expect(body.messages).toEqual([{ role: 'user', content: buildOfficialAutoGeoPrompt(document, []) }])
    expect(candidate.provenance).toMatchObject({ model, providerLabel: 'bailian', providerExecution: true, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } })
    expect(candidate.provenance.boundedPreviewReceipt).toEqual({
      version: 'bounded-qwen-preview-v1', budgetUsd: 1,
      maxEstimatedCostUsd: 0.134144, estimatedCostUsd: 0.0002,
      maxInputTokens: 256000, maxOutputTokens: 2048,
      inputUsdPerMillionTokens: 0.5, outputUsdPerMillionTokens: 3,
      priceCheckedAt: '2026-10-10', pricingUrl: 'https://www.alibabacloud.com/help/en/model-studio/model-pricing',
      attempts: 1, thinking: false,
    })
    expect(JSON.stringify(candidate)).not.toContain('fixture-secret-never-log')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each<[string, OpenAiCompatibleProviderConfiguration]>([
    ['not configured', { configured: false, reason: 'api-key-missing' }],
    ['unsupported model', { ...configuration(), model: 'qwen-plus' }],
    ['unapproved configured snapshot', { ...configuration(), model: 'qwen3.6-plus-2026-04-02' }],
    ['wrong provider label', { ...configuration(), providerLabel: 'openai' }],
    ['label cannot authorize OpenAI host', { ...configuration(), endpoint: 'https://api.openai.com/v1' }],
    ['untrusted endpoint', { ...configuration(), endpoint: 'https://evil.test/v1' }],
    ['empty credential', { ...configuration(), apiKey: ' ' }],
  ])('fails closed before I/O for %s', (_label, config) => {
    const fetchMock = providerFetch()
    expect(() => createBoundedQwenPreviewAdapter({ configuration: config, fetchImpl: fetchMock })).toThrowError(new BoundedQwenPreviewError('CONFIGURATION'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves server configuration once without reading provider fields from document input', async () => {
    vi.stubEnv('NUXT_LLM_ENDPOINT', configuration().endpoint)
    vi.stubEnv('NUXT_LLM_API_KEY', configuration().apiKey)
    vi.stubEnv('NUXT_LLM_MODEL', configuration().model)
    const fetchMock = providerFetch()
    const adapter = createBoundedQwenPreviewAdapter({ fetchImpl: fetchMock })
    vi.stubEnv('NUXT_LLM_MODEL', 'qwen-max')
    vi.stubEnv('NUXT_LLM_API_KEY', 'changed-fixture-key')
    await adapter.rewrite({ ...document, ...{ model: 'qwen-max', apiKey: 'client-value' } }, [])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).model).toBe('qwen3.6-plus')
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer fixture-secret-never-log' })
  })

  it('copies injected server configuration rather than retaining a mutable authority object', async () => {
    const config = configuration()
    const fetchMock = providerFetch()
    const adapter = createBoundedQwenPreviewAdapter({ configuration: config, fetchImpl: fetchMock })
    config.endpoint = 'https://evil.test/v1'
    config.model = 'qwen-max'
    config.apiKey = 'changed-fixture-key'
    await adapter.rewrite(document, [])
    expect(fetchMock.mock.calls[0]?.[0]).toContain('ws-preview.cn-beijing.maas.aliyuncs.com')
  })

  it('fails closed when no server configuration is available', () => {
    expect(() => createBoundedQwenPreviewAdapter()).toThrowError(new BoundedQwenPreviewError('CONFIGURATION'))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['UTF-8 prompt size', '界'.repeat(22_000)],
    ['escaped JSON request size', '"'.repeat(36_000)],
  ])('refuses oversized %s before fetch', async (_label, content) => {
    const fetchMock = providerFetch()
    await expect(create(fetchMock).rewrite({ ...document, content }, [])).rejects.toMatchObject({ code: 'REQUEST_TOO_LARGE' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a final JSON body of exactly 64 KiB and rejects one byte more', async () => {
    const bytesFor = (content: string) => Buffer.byteLength(JSON.stringify({ model: 'qwen3.6-plus', stream: false, messages: [{ role: 'user', content: buildOfficialAutoGeoPrompt({ ...document, content }, []) }], max_tokens: 2048, enable_thinking: false }), 'utf8')
    const content = 'x'.repeat(BOUNDED_QWEN_PREVIEW_LIMITS.maxRequestBytes - bytesFor(''))
    expect(bytesFor(content)).toBe(64 * 1024)
    const acceptedFetch = providerFetch()
    await create(acceptedFetch).rewrite({ ...document, content }, [])
    expect(acceptedFetch).toHaveBeenCalledOnce()
    const rejectedFetch = providerFetch()
    await expect(create(rejectedFetch).rewrite({ ...document, content: `${content}x` }, [])).rejects.toMatchObject({ code: 'REQUEST_TOO_LARGE' })
    expect(rejectedFetch).not.toHaveBeenCalled()
  })

  it('cannot reuse an adapter after success or after failure', async () => {
    for (const fetchMock of [providerFetch(), vi.fn<typeof fetch>().mockRejectedValue(new Error('upstream secret'))]) {
      const adapter = create(fetchMock)
      await adapter.rewrite(document, []).catch(() => {})
      await expect(adapter.rewrite(document, [])).rejects.toMatchObject({ code: 'ALREADY_USED' })
      expect(fetchMock).toHaveBeenCalledOnce()
    }
  })

  it('reserves an attempt before asynchronous I/O so concurrent calls cannot both dispatch', async () => {
    let release!: (response: Response) => void
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { release = resolve }))
    const adapter = create(fetchMock)
    const first = adapter.rewrite(document, [])
    await expect(adapter.rewrite(document, [])).rejects.toMatchObject({ code: 'ALREADY_USED' })
    release(responseFor())
    await first
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([[401, 'UNAUTHORIZED'], [403, 'UNAUTHORIZED'], [429, 'RATE_LIMITED'], [500, 'UPSTREAM'], [302, 'UPSTREAM']] as const)('rejects HTTP %i without retry or provider-body leakage', async (status, code) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('private upstream diagnostic', { status }))
    const error = await create(fetchMock).rewrite(document, []).catch(value => value)
    expect(error).toMatchObject({ code, retryable: false })
    expect(inspect(error)).not.toContain('private upstream diagnostic')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('caps the entire headers wait even if a transport ignores cancellation', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
    const pending = create(fetchMock).rewrite(document, [])
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(60_000)
    await rejected
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('keeps the full deadline active while the response body hangs', async () => {
    vi.useFakeTimers()
    const cancelled = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    const pending = create(fetchMock).rewrite(document, [])
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(60_000)
    await rejected
    expect(cancelled).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it.each(['declared', 'chunked', 'false-small-length'])('rejects a %s response above 200KB', async mode => {
    const headers = mode === 'declared' ? { 'content-length': '200001' } : mode === 'false-small-length' ? { 'content-length': '1' } : undefined
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(200_001), { headers }))
    await expect(create(fetchMock).rewrite(document, [])).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each(['not-json', 'null', '{}'])('rejects malformed envelope %s', async body => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(body))
    await expect(create(fetchMock).rewrite(document, [])).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('rejects invalid UTF-8 rather than accepting a replacement-character document', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([0xc3])))
    await expect(create(fetchMock).rewrite(document, [])).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('cancels a still-open response stream immediately after fatal decoding failure', async () => {
    const cancelled = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0xff])) },
      cancel: cancelled,
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    await expect(create(fetchMock).rewrite(document, [])).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    expect(cancelled).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    undefined, {},
    { prompt_tokens: -1, completion_tokens: 50, total_tokens: 49 },
    { prompt_tokens: 1.5, completion_tokens: 50, total_tokens: 51.5 },
    { prompt_tokens: 100, completion_tokens: null, total_tokens: 100 },
    { prompt_tokens: 100, completion_tokens: 50, total_tokens: 151 },
    { prompt_tokens: 256001, completion_tokens: 1, total_tokens: 256002 },
    { prompt_tokens: 1, completion_tokens: 2049, total_tokens: 2050 },
    { prompt_tokens: Number.MAX_SAFE_INTEGER + 1, completion_tokens: 0, total_tokens: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects missing, invalid or over-cap usage %#', async usage => {
    await expect(create(providerFetch({ ...envelope(), usage })).rewrite(document, [])).rejects.toMatchObject({ code: 'USAGE_INVALID' })
  })

  it('uses the conservative input-tier and fixed output cap to bound maximum estimated cost', async () => {
    const payload = { ...envelope(), usage: { prompt_tokens: 256000, completion_tokens: 2048, total_tokens: 258048 } }
    const result = await create(providerFetch(payload)).rewrite(document, [])
    expect(result.provenance.boundedPreviewReceipt?.estimatedCostUsd).toBe(0.134144)
    expect(result.provenance.boundedPreviewReceipt?.estimatedCostUsd).toBeLessThan(1)
  })

  it.each(['qwen3.7-plus', 'qwen3.6-plus-latest', '', undefined])('rejects unapproved returned model %s', async model => {
    await expect(create(providerFetch({ ...envelope(), model })).rewrite(document, [])).rejects.toMatchObject({ code: 'MODEL_MISMATCH' })
  })

  it.each([['length', 'TRUNCATED_RESPONSE'], ['tool_calls', 'MALFORMED_RESPONSE'], [null, 'MALFORMED_RESPONSE']] as const)('requires stop rather than finish reason %s', async (finish_reason, code) => {
    const payload = envelope()
    const choices = [{ ...payload.choices[0], finish_reason }]
    await expect(create(providerFetch({ ...payload, choices })).rewrite(document, [])).rejects.toMatchObject({ code })
  })

  it('rejects evidence that the provider generated thinking despite disabled thinking', async () => {
    const payload = envelope()
    const withReasoningContent = { ...payload, choices: [{ ...payload.choices[0], message: { ...payload.choices[0]!.message, reasoning_content: 'private reasoning' } }] }
    const withReasoningUsage = { ...payload, usage: { ...payload.usage, completion_tokens_details: { reasoning_tokens: 2 } } }
    for (const value of [withReasoningContent, withReasoningUsage]) {
      await expect(create(providerFetch(value)).rewrite(document, [])).rejects.toMatchObject({ code: 'THINKING_NOT_DISABLED' })
    }
  })

  it('permits an explicit zero-reasoning usage detail and empty reasoning text', async () => {
    const payload = envelope()
    const value = { ...payload, choices: [{ ...payload.choices[0], message: { ...payload.choices[0]!.message, reasoning_content: '' } }], usage: { ...payload.usage, completion_tokens_details: { reasoning_tokens: 0 } } }
    await expect(create(providerFetch(value)).rewrite(document, [])).resolves.toMatchObject({ optimizedContent: document.content })
  })

  // Official non-streaming response contract, checked 2026-10-10:
  // https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions
  it.each([undefined, null, []])('accepts documented null optional fields and no tool calls %#', async tool_calls => {
    const payload = envelope()
    const value = { ...payload, choices: [{ ...payload.choices[0], message: { ...payload.choices[0]!.message, tool_calls, function_call: null, reasoning_content: null, refusal: null, audio: null } }], usage: { ...payload.usage, completion_tokens_details: null } }
    const fetchMock = providerFetch(value)
    const result = await create(fetchMock).rewrite(document, [])
    expect(result.provenance.boundedPreviewReceipt).toMatchObject({ estimatedCostUsd: 0.0002, attempts: 1, thinking: false })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each([
    { tool_calls: [{ type: 'function', function: { name: 'search', arguments: '{}' } }] },
    { tool_calls: {} }, { tool_calls: '' }, { tool_calls: false },
    { function_call: { name: 'search', arguments: '{}' } },
  ])('still rejects actual or malformed tool calls even with stop finish reason %#', async extra => {
    const payload = envelope()
    const value = { ...payload, choices: [{ ...payload.choices[0], message: { ...payload.choices[0]!.message, ...extra } }] }
    const fetchMock = providerFetch(value)
    await expect(create(fetchMock).rewrite(document, [])).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('accepts unavailable optional reasoning detail but not missing required token counts', async () => {
    const payload = envelope()
    const usage = { ...payload.usage, completion_tokens_details: { reasoning_tokens: null } }
    await expect(create(providerFetch({ ...payload, usage })).rewrite(document, [])).resolves.toMatchObject({ optimizedContent: document.content })
    await expect(create(providerFetch({ ...payload, usage: { ...usage, completion_tokens: null } })).rewrite(document, [])).rejects.toMatchObject({ code: 'USAGE_INVALID' })
  })

  it.each([[], '', false])('rejects non-object non-null completion detail %#', async completion_tokens_details => {
    const payload = envelope()
    await expect(create(providerFetch({ ...payload, usage: { ...payload.usage, completion_tokens_details } })).rewrite(document, [])).rejects.toMatchObject({ code: 'USAGE_INVALID' })
  })

  it.each(['unsafe output', 'transport failure'])('does not call Gemini or yield deterministic fallback after %s', async mode => {
    vi.stubEnv('NUXT_AUTOGEO_GEMINI_API_KEY', 'fixture-gemini-key')
    const payload = envelope()
    payload.choices[0]!.message.content = '我們協助客戶提升營收百分之50。'
    const fetchMock = mode === 'unsafe output' ? providerFetch(payload) : vi.fn<typeof fetch>().mockRejectedValue(new Error('private upstream failure'))
    const adapter = create(fetchMock)
    await expect(optimiseGeoDocument(document, adapter)).rejects.toMatchObject({ code: mode === 'unsafe output' ? 'UNSAFE_OUTPUT' : 'TRANSPORT' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does not retain original error message, stack, cause, or secrets', async () => {
    const privateError = Object.assign(new Error('secret-bearing upstream message'), { cause: { apiKey: 'fixture-secret-never-log' }, sql: 'private query' })
    const error = await create(vi.fn<typeof fetch>().mockRejectedValue(privateError)).rewrite(document, []).catch(value => value)
    expect(error).toBeInstanceOf(BoundedQwenPreviewError)
    expect(error).toMatchObject({ code: 'TRANSPORT', retryable: false })
    expect(error).not.toHaveProperty('cause')
    for (const text of [inspect(error), JSON.stringify(error), String(error)]) {
      expect(text).not.toContain('secret-bearing upstream message')
      expect(text).not.toContain('fixture-secret-never-log')
      expect(text).not.toContain('private query')
    }
  })
})
