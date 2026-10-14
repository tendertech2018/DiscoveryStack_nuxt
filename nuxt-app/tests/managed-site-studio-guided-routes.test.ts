import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, createError, createRouter, defineEventHandler, send, setResponseStatus, toWebHandler } from 'h3'
import { createFunnelSession } from '../server/managed-sites/funnel/session-service'
import { setManagedSiteFunnelRepositoryForTests } from '../server/managed-sites/funnel/session-repository'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { analyseStudioReference } from '../server/managed-sites/funnel/studio-reference'
vi.mock('../server/managed-sites/funnel/studio-reference', () => ({ analyseStudioReference: vi.fn() }))
let handler: any
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', defineEventHandler); vi.stubGlobal('createError', createError); vi.stubGlobal('useRuntimeConfig', () => ({}))
  handler = (await import('../server/api/managed-sites/funnel/[...path]')).default
}, 60_000)
afterEach(() => { setManagedSiteFunnelRepositoryForTests(null); vi.unstubAllEnvs(); vi.mocked(analyseStudioReference).mockReset() })
async function fixture() {
  const { repository } = createFunnelSessionMemoryRepository(), created = await createFunnelSession(repository)
  setManagedSiteFunnelRepositoryForTests(repository)
  vi.stubEnv('NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN', 'https://studio.test')
  const app = createApp({ debug: false, onError: async (error, event) => { setResponseStatus(event, (error as any).statusCode || 500); await send(event, JSON.stringify({ statusCode: (error as any).statusCode || 500 }), 'application/json') } })
  const router = createRouter(); router.use('/api/managed-sites/funnel/**', handler); app.use(router)
  const request = (suffix: string, body?: unknown, options: { token?: string; origin?: string } = {}) => toWebHandler(app)(new Request(`https://studio.test/api/managed-sites/funnel/sessions/${created.sessionId}/${suffix}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: options.origin || 'https://studio.test', 'x-managed-site-funnel-token': options.token ?? created.sessionToken }, ...(body ? { body: JSON.stringify(body) } : {}) }))
  return { ...created, request }
}
describe('guided studio actual routes — isolated repository, no network', () => {
  it('requires the exact session token and same-origin mutation authority', async () => {
    const f = await fixture()
    expect((await f.request('studio-intake', undefined, { token: 'wrong' })).status).toBe(404)
    expect((await f.request('studio-intake', { revision: 0, answers: { brandName: 'ÉCLAT' } }, { origin: 'https://other.test' })).status).toBe(403)
    expect((await f.request('studio-intake')).status).toBe(200)
    expect((await f.request('studio-design', { proposalId: 'a'.repeat(64), design: { motion: 'none' } }, { token: 'wrong' })).status).toBe(404)
    expect((await f.request('studio-design', { proposalId: 'a'.repeat(64), design: { motion: 'none' } }, { origin: 'https://other.test' })).status).toBe(403)
    expect((await f.request('studio-design', { proposalId: 'a'.repeat(64), design: { motion: 'none' }, html: '<script/>' })).status).toBe(422)
  })
  it('persists known facts and projects only missing questions without a provider call', async () => {
    const f = await fixture()
    const saved = await f.request('studio-intake', { revision: 0, answers: { brandName: 'ÉCLAT', offer: 'Bijoux', language: 'fr' } })
    expect(saved.status).toBe(200)
    const projected = await (await f.request('studio-intake')).json() as any
    expect(projected.facts.brandName).toBe('ÉCLAT'); expect(projected.questions.map((q: any) => q.field)).toEqual(['audience', 'goal'])
    expect(projected.questions[0].prompt).toContain('clients')
    const stale = await f.request('studio-intake', { revision: 0, answers: { brandName: 'Overwrite' } })
    expect(stale.status).toBe(409)
  })
  it('rejects forged design, media and budget fields before any reference fetch', async () => {
    const f = await fixture()
    expect((await f.request('studio-reference', { revision: 0, url: 'https://shoplazza.com', design: { canvas: 'red' } })).status).toBe(422)
    expect((await f.request('studio-intake', { revision: 0, answers: { media: [{ dataUrl: 'data:text/html,script' }] } })).status).toBe(422)
    expect((await f.request('studio-intake', { revision: 0, amount: 1 })).status).toBe(400)
    expect(analyseStudioReference).not.toHaveBeenCalled()
  })
  it('preserves narrow body limits, requires image rights, and never accepts arbitrary media URLs', async () => {
    const f = await fixture()
    expect((await f.request('studio-intake', { revision: 0, message: 'x'.repeat(66_000) })).status).toBe(413)
    expect((await f.request('studio-media', { revision: 0, slot: 'hero', dataUrl: 'x'.repeat(240_000) })).status).toBe(413)
    expect((await f.request('studio-media', { revision: 0, slot: 'hero', alt: 'Photo', rightsConfirmed: false, dataUrl: 'https://example.com/image.jpg' })).status).toBe(422)
    const state = await (await f.request('studio-intake')).json() as any
    expect(state.media).toBeUndefined(); expect(state.revision).toBe(0)
  })
})
