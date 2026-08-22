import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOGEO_UPSTREAM, buildOfficialAutoGeoPrompt, createAutoGeoApiAdapter } from '../server/geo/autogeo-api'
import { createAutoGeoBailianQwenAdapter, isAllowedBailianEndpoint } from '../server/geo/autogeo-bailian-qwen'
import { optimiseGeoDocument } from '../server/geo/optimise'

const input = {
  title: '網站可讀性改善',
  content: '這份說明介紹如何整理服務頁資訊，讓讀者理解服務內容與下一步。',
  language: 'zh-hant' as const,
}

describe('GEO Workbench V1 contract', () => {
  beforeEach(() => {
    vi.stubEnv('NUXT_AUTOGEO_BAILIAN_API_KEY', '')
    vi.stubEnv('NUXT_AUTOGEO_BAILIAN_ENDPOINT', '')
    vi.stubEnv('NUXT_AUTOGEO_BAILIAN_MODEL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses a transparent reference fallback when all configured providers are unavailable', async () => {
    const result = await optimiseGeoDocument(input)

    expect(result.version).toBe('geo-workbench-v1')
    expect(result.candidate.provider).toBe('reference-rules-v1')
    expect(result.candidate.provenance.execution).toBe('reference-fallback')
    expect(result.candidate.provenance.fallbackReason).toBe('bailian-not-configured')
    expect(result.candidate.optimizedContent).toContain(input.content)
    expect(result.candidate.appliedRuleIds).toContain('claim-safety')
    expect(result.comparison.find(metric => metric.id === 'sourcePreservation')?.after).toBe(100)
    expect(result.interpretationLimit).toContain('不代表')
  })

  it('only accepts the documented HTTPS Model Studio compatible endpoint shape', () => {
    expect(isAllowedBailianEndpoint('https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions')).toBe(true)
    expect(isAllowedBailianEndpoint('https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions')).toBe(true)
    expect(isAllowedBailianEndpoint('https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions')).toBe(true)
    expect(isAllowedBailianEndpoint('http://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions')).toBe(false)
    expect(isAllowedBailianEndpoint('https://evil.example/compatible-mode/v1/chat/completions')).toBe(false)
    expect(isAllowedBailianEndpoint('https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions?redirect=https://evil.example')).toBe(false)
  })

  it('does not construct a Bailian request for missing or invalid configuration', () => {
    const capture = (factory: () => unknown) => {
      try {
        factory()
      }
      catch (error) {
        return error
      }
      throw new Error('Expected invalid provider configuration to throw.')
    }
    expect(capture(() => createAutoGeoBailianQwenAdapter({ apiKey: 'test-only-key' })))
      .toMatchObject({ name: 'AutoGeoBailianConfigurationError', issue: 'missing-endpoint' })
    expect(capture(() => createAutoGeoBailianQwenAdapter({ apiKey: 'test-only-key', endpoint: 'https://example.com/compatible-mode/v1/chat/completions' })))
      .toMatchObject({ name: 'AutoGeoBailianConfigurationError', issue: 'invalid-endpoint' })
  })

  it('uses the AutoGEO framework prompt through a configured Bailian Qwen provider with non-sensitive provenance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'qwen-plus',
      choices: [{ message: { content: '這是以百煉 Qwen 產生的改寫內容。' } }],
      usage: { prompt_tokens: 101, completion_tokens: 55, total_tokens: 156 },
    }), { status: 200 }))
    const adapter = createAutoGeoBailianQwenAdapter({
      apiKey: 'test-only-key',
      endpoint: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: 'qwen-plus',
      fetchImpl,
      requestIdFactory: () => 'geo-test-request-id',
    })
    const result = await optimiseGeoDocument(input, adapter)

    expect(result.candidate.provider).toBe('autogeo-bailian-qwen')
    expect(result.candidate.provenance.execution).toBe('autogeo-framework-bailian-qwen')
    expect(result.candidate.provenance.model).toBe('qwen-plus')
    expect(result.candidate.provenance.providerRequestId).toBe('geo-test-request-id')
    expect(result.candidate.provenance.usage).toEqual({ inputTokens: 101, outputTokens: 55, totalTokens: 156 })
    const request = fetchImpl.mock.calls[0]?.[1]
    const payload = JSON.parse(String(request?.body))
    expect(payload.model).toBe('qwen-plus')
    expect(payload.messages[0].content).toContain('maximizes its visibility and impact')
    expect(payload.messages[0].content).toContain(input.title)
    expect(request?.headers).toMatchObject({ authorization: 'Bearer test-only-key', 'x-discoverystack-request-id': 'geo-test-request-id' })
  })

  it('classifies an unreachable Bailian Qwen provider without returning a false success candidate', async () => {
    const adapter = createAutoGeoBailianQwenAdapter({
      apiKey: 'test-only-key',
      endpoint: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    })
    await expect(optimiseGeoDocument(input, adapter)).rejects.toMatchObject({ name: 'AutoGeoBailianProviderError', issue: 'upstream' })
  })

  it('retains only non-sensitive HTTP status for an upstream Bailian rejection', async () => {
    const adapter = createAutoGeoBailianQwenAdapter({
      apiKey: 'test-only-key',
      endpoint: 'https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      fetchImpl: vi.fn().mockResolvedValue(new Response('provider detail intentionally ignored', { status: 403 })),
    })

    await expect(adapter.rewrite(input, [])).rejects.toMatchObject({
      issue: 'upstream',
      httpStatus: 403,
    })
  })

  it('uses the complete official AutoGEO prompt/API path when a server-side credential is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '這是經完整 AutoGEO API 改寫的內容。' }] } }],
    }), { status: 200 }))
    const adapter = createAutoGeoApiAdapter({ apiKey: 'test-only-key', fetchImpl })
    const result = await optimiseGeoDocument(input, adapter)

    expect(result.candidate.provider).toBe('autogeo-api')
    expect(result.candidate.provenance.execution).toBe('official-autogeo-api')
    expect(result.candidate.provenance.upstreamRevision).toBe(AUTOGEO_UPSTREAM.revision)
    expect(result.candidate.optimizedContent).toBe('這是經完整 AutoGEO API 改寫的內容。')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const request = fetchImpl.mock.calls[0]?.[1]
    const payload = JSON.parse(String(request?.body))
    expect(payload.contents[0].parts[0].text).toContain('maximizes its visibility and impact')
    expect(payload.contents[0].parts[0].text).toContain('Attribute all factual claims to credible, authoritative sources with clear citations.')
    expect(payload.contents[0].parts[0].text).toContain(input.title)
    expect(payload.generationConfig).toBeUndefined()
    expect(request?.headers).toMatchObject({ 'x-goog-api-key': 'test-only-key' })
  })

  it('does not claim official AutoGEO ran when its provider response is unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    const adapter = createAutoGeoApiAdapter({ apiKey: 'test-only-key', fetchImpl })

    await expect(optimiseGeoDocument(input, adapter)).rejects.toMatchObject({ name: 'AutoGeoProviderError' })
    expect(buildOfficialAutoGeoPrompt(input)).toContain(AUTOGEO_UPSTREAM.model === 'gemini-2.5-pro' ? 'Quality Guidelines to Follow' : '')
  })

  it('rejects oversize input before any adapter runs', async () => {
    await expect(optimiseGeoDocument({ title: '標題', content: 'x'.repeat(12001), language: 'zh-hant' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
