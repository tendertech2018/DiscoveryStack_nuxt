import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_MESSAGES_ENDPOINT, ANTHROPIC_STUDIO_DEFAULT_MODEL, createAnthropicStudioClient, resolveAnthropicStudioConfiguration, type AnthropicStudioConfiguration } from '../server/llm-provider/anthropic'
import { resolveWebsiteStudioProviderConfiguration } from '../server/llm-provider/website-studio'
import { generateStudioPreview, parseStudioRequest } from '../server/managed-sites/funnel/studio-preview'
import { createFunnelSession } from '../server/managed-sites/funnel/session-service'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { studioModelResponse } from './fixtures/managed-site/studio-model'

const fixtureKey = 'isolated-claude-fixture-not-a-real-key'
const config: AnthropicStudioConfiguration = { configured: true, endpoint: ANTHROPIC_MESSAGES_ENDPOINT, providerLabel: 'anthropic', source: 'anthropic-studio', apiKey: fixtureKey, model: ANTHROPIC_STUDIO_DEFAULT_MODEL }
const brief = { brandName: '日光工作室', brief: '提供初學瑜伽課程，讓新同學先了解課程，再詢問體驗。', siteType: 'brand_blog', goal: 'increase_bookings', mode: 'ai' } as const
const completion = { messages: [{ role: 'system', content: 'Return JSON only.' }, { role: 'user', content: 'Public brief only' }], responseFormat: 'json_object' } as const
const envelope = (content = '{}', overrides = {}) => ({ id: 'msg_fixture', type: 'message', role: 'assistant', model: config.model, stop_reason: 'end_turn', content: [{ type: 'text', text: content }], usage: { input_tokens: 20, output_tokens: 20 }, ...overrides })
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
const complete = (fetchImpl: typeof fetch, extra = {}) => createAnthropicStudioClient(config, fetchImpl).complete({ ...completion, messages: [...completion.messages], ...extra })
afterEach(() => vi.unstubAllEnvs())

describe('Claude website studio configuration and native transport', () => {
  it('requires an explicit studio switch and never borrows the old provider key', () => {
    const legacy = { NUXT_LLM_ENDPOINT: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', NUXT_LLM_API_KEY: 'legacy-fixture-key', ANTHROPIC_API_KEY: fixtureKey }
    expect(resolveWebsiteStudioProviderConfiguration({ env: legacy, runtimeConfig: {} })).toMatchObject({ configured: true, providerLabel: 'bailian' })
    expect(resolveWebsiteStudioProviderConfiguration({ env: { ...legacy, NUXT_MANAGED_SITE_STUDIO_PROVIDER: 'anthropic' }, runtimeConfig: {} })).toEqual(config)
    expect(resolveWebsiteStudioProviderConfiguration({ env: { NUXT_MANAGED_SITE_STUDIO_PROVIDER: 'anthropic', NUXT_LLM_API_KEY: 'legacy-fixture-key' }, runtimeConfig: {} })).toEqual({ configured: false, reason: 'api-key-missing' })
    expect(resolveWebsiteStudioProviderConfiguration({ env: { ...legacy, NUXT_MANAGED_SITE_STUDIO_PROVIDER: 'unrecognized' }, runtimeConfig: {} }).configured).toBe(false)
  })
  it.each([
    { ANTHROPIC_API_KEY: 'not\na\nkey' },
    { ANTHROPIC_API_KEY: 'x'.repeat(513) },
    { ANTHROPIC_API_KEY: fixtureKey, ANTHROPIC_MODEL: 'unknown-model' },
    { ANTHROPIC_API_KEY: fixtureKey, ANTHROPIC_WORKSPACE_ID: 'unknown\nheader' },
  ])('fails closed for malformed configuration', env => {
    expect(resolveAnthropicStudioConfiguration(env).configured).toBe(false)
  })
  it('sends only native Messages parameters to the fixed official origin, without credentials in the body', async () => {
    const fetchImpl = vi.fn(async () => response(envelope()))
    expect(await complete(fetchImpl as typeof fetch)).toEqual({ content: '{}' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ANTHROPIC_MESSAGES_ENDPOINT)
    expect(init.redirect).toBe('error')
    expect(init.headers).toMatchObject({ 'x-api-key': fixtureKey, 'anthropic-version': '2023-06-01' })
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({ model: config.model, max_tokens: 12288, stream: false, system: 'Return JSON only.', messages: [{ role: 'user', content: 'Public brief only' }], thinking: { type: 'between_tools' } })
    expect(init.body).not.toContain(fixtureKey)
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('response_format')
    expect(body).not.toHaveProperty('temperature')
  })
  it('uses the documented older thinking mode only for the explicit 4.6 alternative', async () => {
    const fetchImpl = vi.fn(async () => response(envelope('{}', { model: 'claude-sonnet-4-6' })))
    await createAnthropicStudioClient({ ...config, model: 'claude-sonnet-4-6', workspaceId: 'wrkspc_test123456' }, fetchImpl as typeof fetch).complete({ ...completion, messages: [...completion.messages] })
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).thinking).toEqual({ type: 'disabled' })
    expect(init.headers).toMatchObject({ 'anthropic-workspace-id': 'wrkspc_test123456' })
  })
  it('rejects another endpoint before any fetch', () => {
    const fetchImpl = vi.fn()
    expect(() => createAnthropicStudioClient({ ...config, endpoint: 'https://attacker.invalid/v1/messages' } as any, fetchImpl)).toThrow('configuration')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([401, 403, 429, 500])('redacts HTTP %i errors and does not retry', async status => {
    const fetchImpl = vi.fn(async () => new Response(`private upstream ${fixtureKey}`, { status }))
    const result = await complete(fetchImpl as typeof fetch).catch(error => error)
    expect(result.message).toMatch(/^Claude provider unavailable:/u)
    expect(JSON.stringify(result)).not.toContain(fixtureKey)
    expect(result.message).not.toContain('private upstream')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it.each([
    envelope('{}', { stop_reason: 'max_tokens' }), envelope('{}', { stop_reason: 'refusal' }),
    envelope('{}', { content: [{ type: 'tool_use', input: {} }] }), envelope('{}', { model: 'another-model' }),
    envelope('```json\n{}\n```'), envelope('[]'), envelope(''), envelope('{}', { role: 'user' }),
  ])('rejects incomplete, untrusted or malformed responses', async value => {
    await expect(complete((async () => response(value)) as typeof fetch)).rejects.toThrow('malformed_response')
  })
  it('bounds response bytes and retains the timeout until the response body completes', async () => {
    await expect(complete((async () => response(envelope('x'.repeat(3000)))) as typeof fetch, { maxResponseBytes: 512 })).rejects.toThrow('malformed_response')
    const fetchImpl = (async (_url, init) => new Response(new ReadableStream({ start(controller) { init?.signal?.addEventListener('abort', () => controller.error(new Error(fixtureKey)), { once: true }) } }))) as typeof fetch
    await expect(complete(fetchImpl, { timeoutMs: 10 })).rejects.toThrow('timeout')
  })
})

describe('Claude goes through the actual studio validators and revision flow', () => {
  it.each(['one_page', 'brand_blog', 'simple_commerce'] as const)('generates complete %s proposals using one native call', async siteType => {
    const { session } = await createFunnelSession(createFunnelSessionMemoryRepository().repository)
    const fetchImpl = vi.fn((async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      const publicContext = JSON.parse(request.messages[0].content)
      return response(envelope(JSON.stringify(studioModelResponse(publicContext))))
    }) as typeof fetch)
    const initial = await generateStudioPreview(session, parseStudioRequest({ ...brief, siteType }), { providerConfiguration: config, fetchImpl })
    expect(initial.source).toBe('llm')
    expect(initial.strategy?.source).toBe('llm')
    expect(initial.pages).toHaveLength(siteType === 'one_page' ? 1 : siteType === 'brand_blog' ? 6 : 5)
    expect(JSON.stringify(initial)).not.toContain(fixtureKey)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const revised = await generateStudioPreview(session, parseStudioRequest({ ...brief, siteType, revision: { base: initial.editContext, instruction: '首頁更親切，其他保留' } }), { providerConfiguration: config, fetchImpl })
    expect(revised.changes).toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(revised.editContext?.pages[0]?.title).toContain('從容開始')
    await generateStudioPreview(session, parseStudioRequest({ ...brief, siteType, mode: 'template' }), { providerConfiguration: config, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('never silently retries a failed Claude edit with Qwen or a template', async () => {
    const { session } = await createFunnelSession(createFunnelSessionMemoryRepository().repository)
    const initial = await generateStudioPreview(session, parseStudioRequest({ ...brief, mode: 'template' }))
    const fetchImpl = vi.fn(async () => new Response('redacted', { status: 401 }))
    await expect(generateStudioPreview(session, parseStudioRequest({ ...brief, revision: { base: initial.editContext, instruction: '首頁更親切' } }), { providerConfiguration: config, fetchImpl: fetchImpl as typeof fetch })).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
