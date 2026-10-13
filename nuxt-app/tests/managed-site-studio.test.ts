import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, createError, createRouter, defineEventHandler, send, setResponseStatus, toWebHandler } from 'h3'
import { parseStudioRequest, generateStudioPreview } from '../server/managed-sites/funnel/studio-preview'
import { createFunnelSession, loadFunnelSession, saveFunnelStep } from '../server/managed-sites/funnel/session-service'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { setManagedSiteFunnelRepositoryForTests } from '../server/managed-sites/funnel/session-repository'
import { createDeterministicManagedSiteBlueprint } from '../server/managed-sites/live-connectors/adapters'
import { managedSiteStableFingerprint } from '../server/managed-sites/live-connectors/canonical'
import { studioAnswers } from '../utils/managedSiteStudio'
import { firstIncompleteStep, normalizedModulesForSiteType } from '../utils/managedSiteFunnel'

const brief = { brandName: '日光工作室', brief: '提供初學瑜伽課程，讓客人預約體驗。', siteType: 'brand_blog', goal: 'increase_bookings' } as const
const provider = { configured: true as const, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'test-only', apiKey: 'test-key', providerLabel: 'openai' as const, source: 'llm' as const }
beforeAll(() => {
  ;(globalThis as any).defineEventHandler = defineEventHandler
  ;(globalThis as any).createError = createError
  ;(globalThis as any).useRuntimeConfig = () => ({})
})

describe('preview-first website studio', () => {
  it('validates bounded inputs and never accepts client identity, price or consent fields', () => {
    expect(parseStudioRequest(brief).mode).toBe('template')
    for (const patch of [{ brandName: '' }, { brief: 'x'.repeat(1801) }, { brandName: 'x'.repeat(161) }, { siteType: 'custom' }, { goal: 'custom' }, { mode: 'free-ai' }, { ownerUserId: 1 }, { consent: true }, { price: 0 }, { contact: 'a@b.test' }]) {
      expect(() => parseStudioRequest({ ...brief, ...patch })).toThrow()
    }
  })

  it.each(['one_page', 'brand_blog', 'simple_commerce'] as const)('renders three real %s layouts before contact data, without provider or persistence', async siteType => {
    const memory = createFunnelSessionMemoryRepository()
    const created = await createFunnelSession(memory.repository)
    const generate = vi.fn()
    const result = await generateStudioPreview(created.session, parseStudioRequest({ ...brief, siteType }), { providerConfiguration: provider, generationAdapter: { generate } })
    expect(generate).not.toHaveBeenCalled()
    expect(result.source).toBe('template')
    expect(result.sourceReason).toContain('沒有呼叫 AI')
    expect(result.designs.map(item => item.preset)).toEqual(['atelier', 'bloom', 'alignment'])
    expect(new Set(result.designs.map(item => item.html)).size).toBe(3)
    for (const design of result.designs) {
      expect(design.html).toContain(brief.brandName)
      expect(design.html).not.toContain('風格偏好：')
      expect(design.html).not.toContain('主要服務：')
      expect(design.html).toContain(`data-site-preset="${design.preset}"`)
      expect(design.html).toContain('Content-Security-Policy')
      expect(design.html).not.toMatch(/<script\b|\shref=|\son[a-z]+=/iu)
    }
    expect((await loadFunnelSession(created.sessionId, created.sessionToken, memory.repository)).answers).toEqual({})
  })

  it('makes only one AI call for three layouts, drops existing private/session data from model input', async () => {
    const memory = createFunnelSessionMemoryRepository()
    const created = await createFunnelSession(memory.repository)
    const generate = vi.fn(async (request: any) => {
      expect(JSON.stringify(request)).not.toContain('private-customer-email')
      const blueprint = createDeterministicManagedSiteBlueprint(request)
      blueprint.pages[0]!.title = 'AI 測試文案'
      return { schemaVersion: 'managed-site-blueprint-provider-response-v1' as const, providerKey: 'studio-test', providerModel: 'test', providerRequestId: 'test', requestFingerprint: request.requestFingerprint, blueprint, blueprintHash: managedSiteStableFingerprint(blueprint) }
    })
    const result = await generateStudioPreview({ ...created.session, answers: { contact: { email: 'private-customer-email@example.test', contactName: 'Private' } } }, parseStudioRequest({ ...brief, mode: 'ai' }), { providerConfiguration: provider, generationAdapter: { generate } })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.source).toBe('llm')
    expect(result.designs).toHaveLength(3)
    expect(result.designs.every(design => design.html.includes('AI 測試文案'))).toBe(true)
  })

  it('labels an AI outage as template fallback and refuses post-checkout sessions', async () => {
    const memory = createFunnelSessionMemoryRepository()
    const created = await createFunnelSession(memory.repository)
    const result = await generateStudioPreview(created.session, parseStudioRequest({ ...brief, mode: 'ai' }), { providerConfiguration: provider, generationAdapter: { generate: async () => { throw new Error('private provider error') } } })
    expect(result.source).toBe('template')
    expect(result.sourceReason).toContain('暫時無法回應')
    expect(JSON.stringify(result)).not.toContain('private provider error')
    await expect(generateStudioPreview({ ...created.session, status: 'building' }, parseStudioRequest(brief))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('adopts the chosen preset while keeping contact and all launch gates incomplete', async () => {
    const memory = createFunnelSessionMemoryRepository()
    const created = await createFunnelSession(memory.repository)
    const updated = await saveFunnelStep(created.sessionId, created.sessionToken, { step: 1, answers: { ...studioAnswers(brief, 'bloom'), existingSite: { hasSite: false }, modules: normalizedModulesForSiteType(brief.siteType, []) } }, memory.repository)
    expect(updated.answers).toMatchObject({ style: { customerSitePreset: 'bloom' } })
    expect(updated.answers).not.toHaveProperty('contact')
    expect(firstIncompleteStep(updated.answers as any, { accepted: false })).toBe(2)
    expect(updated.consentSnapshot).toBeNull()
    expect(updated.draftOrderId).toBeNull()
  })

  it('uses the authenticated, same-origin, no-store bounded route with a shared generation limit', async () => {
    const memory = createFunnelSessionMemoryRepository()
    const created = await createFunnelSession(memory.repository)
    setManagedSiteFunnelRepositoryForTests(memory.repository)
    const previousOrigin = process.env.NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN
    process.env.NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN = 'https://studio.test'
    try {
      const handler = (await import('../server/api/managed-sites/funnel/[...path]')).default
      const app = createApp({ debug: false, onError: async (error, event) => { setResponseStatus(event, (error as any).statusCode || 500); await send(event, '{}', 'application/json') } })
      const router = createRouter(); router.use('/api/managed-sites/funnel/**', handler); app.use(router)
      const run = (token: string, origin = 'https://studio.test', body: unknown = brief, method = 'POST') => toWebHandler(app)(new Request(`https://studio.test/api/managed-sites/funnel/sessions/${created.sessionId}/studio-preview`, { method, headers: { origin, 'content-type': 'application/json', 'x-managed-site-funnel-token': token }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }))
      expect((await run('wrong-token')).status).toBe(404)
      expect((await run(created.sessionToken, 'https://attacker.test')).status).toBe(403)
      expect((await run(created.sessionToken, undefined, { ...brief, ownerUserId: 99 })).status).toBe(422)
      expect((await run(created.sessionToken, undefined, { ...brief, brief: 'x'.repeat(66000) })).status).toBe(413)
      expect((await run(created.sessionToken, undefined, brief, 'GET')).status).toBe(405)
      for (let i = 0; i < 5; i++) {
        const response = await run(created.sessionToken)
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toContain('no-store')
        const result = await response.json() as any
        expect(result.designs).toHaveLength(3)
        expect(result.source).toBe('template')
      }
      expect((await run(created.sessionToken, undefined, { ...brief, brandName: '別的品牌' })).status).toBe(429)
      const saved = (await loadFunnelSession(created.sessionId, created.sessionToken, memory.repository)).answers as any
      expect(saved.studio.proposals.length).toBeGreaterThan(0)
      expect(saved.studio.confirmed).toBeNull()
      expect(saved).not.toHaveProperty('company')
    } finally {
      setManagedSiteFunnelRepositoryForTests(null)
      if (previousOrigin === undefined) delete process.env.NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN
      else process.env.NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN = previousOrigin
    }
  })
})
