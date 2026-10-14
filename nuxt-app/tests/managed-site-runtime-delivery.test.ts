import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFunnelSession, type FunnelAnswers } from '../server/managed-sites/funnel/session-service'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { brandStudioFixture } from './fixtures/managed-site/brand-studio'
import { studioAnswers } from '../utils/managedSiteStudio'
import { studioContentAnswersFingerprint, studioProposalId } from '../server/managed-sites/funnel/studio-state'
import { confirmedRuntimePackage, prepareFunnelRuntime, publishFunnelRuntime, funnelRuntimeStatus, restoreFunnelRuntimePackage } from '../server/managed-sites/funnel/runtime-delivery'
import { managedSiteStableFingerprint } from '../server/managed-sites/live-connectors/canonical'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const runtimeUrl = new URL('../../services/customer-site-runtime/lib/config.mjs', import.meta.url)
const { parseConfig } = await import(runtimeUrl.href)
const deliveryUrl = new URL('../../services/customer-site-runtime/lib/delivery.mjs', import.meta.url)
const { validateDelivery, deliveryFingerprint } = await import(deliveryUrl.href)
const choice = { engine: 'commerce', currency: 'JPY', timeZone: 'Asia/Tokyo' } as const
async function fixture() {
  const f = createFunnelSessionMemoryRepository()
  const created = await createFunnelSession(f.repository)
  const blueprint = brandStudioFixture()
  blueprint.siteType = 'simple_commerce'
  blueprint.pages[0]!.sections.push({ sectionId: 'native-shop-slot', kind: 'module_slot', heading: 'Shop the collection', body: 'Approved collection copy.', ctaLabel: 'Shop now', ctaHref: null, moduleKey: 'shopify_commerce', formEndpoint: null })
  blueprint.selectedModulePlacements.push({ moduleKey: 'shopify_commerce', mode: 'safe_placeholder', pageKey: 'home', sectionId: 'native-shop-slot' })
  const brief = { brandName: blueprint.brandName, brief: 'Synthetic jewellery brand', goal: 'sell_online' as const, siteType: 'simple_commerce' as const, language: 'en' }
  const content = { brief, blueprint, source: 'llm' as const, sourceReason: 'synthetic fixture, no provider call', generatedAt: '2026-10-15T00:00:00Z' }
  const proposal = { ...content, id: studioProposalId(created.session.id, content) }
  const answers = studioAnswers(brief, 'atelier') as FunnelAnswers
  answers.modules = ['shopify_commerce', 'contact_lead_capture']
  answers.studio = { schemaVersion: 'funnel-studio-state-v1', proposals: [proposal], confirmed: { proposalId: proposal.id, preset: 'atelier', answersFingerprint: studioContentAnswersFingerprint(answers), confirmedAt: content.generatedAt } }
  created.session.answers = answers
  return { ...f, session: created.session, proposal }
}
afterEach(() => vi.unstubAllEnvs())
describe('confirmed brand design to native shopping / booking', () => {
  it('preserves source confirmation, images/copy/design and binds real routes without another model or payment', async () => {
    const f = await fixture(), before = structuredClone(f.proposal)
    const manifest = confirmedRuntimePackage(f.session, choice)
    if (process.env.DS_RUNTIME_QA_OUTPUT) {
      const directory = process.env.DS_RUNTIME_QA_OUTPUT
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'synthetic-commerce.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
      const bookingBrief = { ...f.proposal.brief, goal: 'increase_bookings' as const, siteType: 'brand_blog' as const, language: 'ar' }
      const blueprint = structuredClone(f.proposal.blueprint)
      blueprint.locale = 'ar'; blueprint.siteType = 'brand_blog'
      blueprint.selectedModulePlacements = blueprint.selectedModulePlacements.map(m => m.moduleKey === 'shopify_commerce' ? { ...m, moduleKey: 'google_booking_assisted_integration' } : m)
      blueprint.pages[0]!.sections.at(-1)!.moduleKey = 'google_booking_assisted_integration'
      const content = { ...f.proposal, brief: bookingBrief, blueprint }; const { id: _id, ...identity } = content
      const proposal = { ...identity, id: studioProposalId(f.session.id, identity) }
      const answers = studioAnswers(bookingBrief, 'atelier') as FunnelAnswers
      answers.modules = ['google_booking_assisted_integration', 'contact_lead_capture']
      answers.studio = { schemaVersion: 'funnel-studio-state-v1', proposals: [proposal], confirmed: { proposalId: proposal.id, preset: 'atelier', confirmedAt: proposal.generatedAt, answersFingerprint: studioContentAnswersFingerprint(answers) } }
      const booking = confirmedRuntimePackage({ ...f.session, answers }, { engine: 'booking_blog', currency: 'AED', timeZone: 'Asia/Dubai' })
      writeFileSync(join(directory, 'synthetic-booking.json'), JSON.stringify(booking, null, 2), { flag: 'wx', mode: 0o600 })
    }
    expect(parseConfig(manifest.config)).toMatchObject({ locale: 'en', currency: 'JPY', commerce: { currency: 'JPY', paymentMode: 'disabled' }, booking: { timeZone: 'Asia/Tokyo' } })
    expect(manifest.approvedDelivery.approvedBlueprintHash).toBe(managedSiteStableFingerprint(before.blueprint))
    expect(manifest.config.description).toBe(before.blueprint.pages[0]!.description)
    expect(manifest.config.tagline).toBe(before.blueprint.pages[0]!.title)
    expect(validateDelivery(manifest.approvedDelivery, parseConfig(manifest.config))).toEqual(manifest.approvedDelivery)
    expect(manifest.approvedDelivery.assets[0]!.content).toContain('data-studio-renderer="brand-studio-v2"')
    expect(manifest.approvedDelivery.assets.find(a => a.path === 'index.html')!.content).toContain('href="/store"')
    expect(f.proposal).toEqual(before)
    expect(manifest.launch).toMatchObject({ deployed: false, paymentVerified: false })
    const { manifestFingerprint, ...rest } = manifest
    expect(deliveryFingerprint(rest)).toBe(manifestFingerprint)
  })
  it('refuses a missing/stale/cross-session confirmation, wrong engine and existing paid order', async () => {
    const f = await fixture()
    expect(() => confirmedRuntimePackage(f.session, { ...choice, currency: 'XXX' })).toThrow()
    expect(() => confirmedRuntimePackage(f.session, { ...choice, engine: 'booking_blog' })).toThrow()
    expect(() => confirmedRuntimePackage({ ...f.session, id: f.session.id + 1 }, choice)).toThrow()
    expect(() => confirmedRuntimePackage({ ...f.session, draftOrderId: 4 }, choice)).toThrow()
    ;(f.session.answers as FunnelAnswers).company!.whatWeDo = 'Changed brief'
    expect(() => confirmedRuntimePackage(f.session, choice)).toThrow()
  })
  it('persists only bounded market choice and hash; no host means no external request', async () => {
    vi.stubEnv('MANAGED_SITE_RUNTIME_TARGETS_JSON', '[]')
    const f = await fixture(), fetcher = vi.fn()
    const artifact = await prepareFunnelRuntime(f.session, choice, f.repository)
    expect(restoreFunnelRuntimePackage(f.session)).toEqual(artifact)
    expect(funnelRuntimeStatus(f.session)).toMatchObject({ prepared: true, hostingConfigured: false, chargesCard: false, buysHosting: false })
    await expect(publishFunnelRuntime(f.session, artifact.manifestFingerprint, f.repository, fetcher)).rejects.toMatchObject({ statusCode: 409 })
    expect(fetcher).not.toHaveBeenCalled()
    expect((f.session.answers as FunnelAnswers).runtimeDelivery?.publishing).not.toBe(true)
  })
  it('signs exact bytes, freezes before network and verifies readback', async () => {
    const f = await fixture()
    const origin = 'https://synthetic-runtime.onrender.com'
    vi.stubEnv('MANAGED_SITE_RUNTIME_TARGETS_JSON', JSON.stringify([{ sessionId: f.session.id, origin, secretEnv: 'SITE_RUNTIME_DEPLOY_KEY_FIXTURE', enabled: true }]))
    vi.stubEnv('SITE_RUNTIME_DEPLOY_KEY_FIXTURE', 'synthetic-fixture-deployment-key-not-real-0000000')
    const artifact = await prepareFunnelRuntime(f.session, choice, f.repository)
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect((f.session.answers as FunnelAnswers).runtimeDelivery?.publishing).toBe(true)
      if (url.endsWith('/api/deployment')) {
        expect(init?.redirect).toBe('error')
        expect((init?.headers as any)['x-site-deploy-signature']).toMatch(/^[a-f0-9]{64}$/u)
        expect(JSON.parse(init!.body as string).delivery).toEqual(artifact.approvedDelivery)
        return Response.json({ status: 'production_verified', siteId: artifact.config.siteId, contentHash: artifact.approvedDelivery.contentHash, origin })
      }
      return Response.json({ mode: 'production', siteId: artifact.config.siteId, deliveryHash: artifact.approvedDelivery.contentHash })
    })
    const result = await publishFunnelRuntime(f.session, artifact.manifestFingerprint, f.repository, fetcher as typeof fetch)
    expect(result.publication.contentHash).toBe(artifact.approvedDelivery.contentHash)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect((f.session.answers as FunnelAnswers).runtimeDelivery?.publishing).toBe(false)
    expect(result.paymentVerified).toBe(false)
  })
  it('uncertain publication freezes all new preparations; retry uses the same confirmed bytes', async () => {
    const f = await fixture(), origin = 'https://synthetic-runtime.onrender.com'
    vi.stubEnv('MANAGED_SITE_RUNTIME_TARGETS_JSON', JSON.stringify([{ sessionId: f.session.id, origin, secretEnv: 'SITE_RUNTIME_DEPLOY_KEY_FIXTURE', enabled: true }]))
    vi.stubEnv('SITE_RUNTIME_DEPLOY_KEY_FIXTURE', 'synthetic-fixture-deployment-key-not-real-0000000')
    const artifact = await prepareFunnelRuntime(f.session, choice, f.repository)
    const sent: string[] = []
    await expect(publishFunnelRuntime(f.session, artifact.manifestFingerprint, f.repository, vi.fn(async (_url, init) => { sent.push(init!.body as string); throw new Error('Synthetic lost response') }) as typeof fetch)).rejects.toThrow('Synthetic lost response')
    expect(funnelRuntimeStatus(f.session).publishing).toBe(true)
    await expect(prepareFunnelRuntime(f.session, { ...choice, currency: 'USD' }, f.repository)).rejects.toMatchObject({ statusCode: 409 })
    expect(restoreFunnelRuntimePackage(f.session)).toEqual(artifact)
    const retry = vi.fn(async (url, init) => {
      if (String(url).endsWith('/api/deployment')) { expect(init!.body).toBe(sent[0]); return Response.json({ status: 'production_verified', siteId: artifact.config.siteId, contentHash: artifact.approvedDelivery.contentHash, origin }) }
      return Response.json({ mode: 'production', siteId: artifact.config.siteId, deliveryHash: artifact.approvedDelivery.contentHash })
    })
    await publishFunnelRuntime(f.session, artifact.manifestFingerprint, f.repository, retry as typeof fetch)
    expect(funnelRuntimeStatus(f.session).publishing).toBe(false)
  })
  it('rejects untrusted hosts before a call, and oversized or mismatching readback stays unverified', async () => {
    const f = await fixture(), origin = 'https://synthetic-runtime.onrender.com'
    const target = { sessionId: f.session.id, origin: 'http://127.0.0.1', secretEnv: 'SITE_RUNTIME_DEPLOY_KEY_FIXTURE', enabled: true }
    vi.stubEnv('MANAGED_SITE_RUNTIME_TARGETS_JSON', JSON.stringify([target]))
    vi.stubEnv('SITE_RUNTIME_DEPLOY_KEY_FIXTURE', 'synthetic-fixture-deployment-key-not-real-0000000')
    const artifact = await prepareFunnelRuntime(f.session, choice, f.repository), fetcher = vi.fn()
    await expect(publishFunnelRuntime(f.session, artifact.manifestFingerprint, f.repository, fetcher)).rejects.toMatchObject({ statusCode: 503 })
    expect(fetcher).not.toHaveBeenCalled()
    vi.stubEnv('MANAGED_SITE_RUNTIME_TARGETS_JSON', JSON.stringify([{ ...target, origin }]))
    await expect(publishFunnelRuntime(f.session, artifact.manifestFingerprint, f.repository, vi.fn(async () => new Response(' '.repeat(5000))) as typeof fetch)).rejects.toMatchObject({ statusCode: 502 })
    expect(funnelRuntimeStatus(f.session).publication).toBeNull()
    expect(funnelRuntimeStatus(f.session).publishing).toBe(true)
  })
})
