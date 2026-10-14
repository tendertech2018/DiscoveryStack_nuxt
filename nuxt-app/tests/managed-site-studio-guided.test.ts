import { describe, expect, it, vi } from 'vitest'
import { initialStudioLanguage, normalizeSiteLanguage, siteTextDirection } from '../utils/managedSiteLanguage'
import { EN_STUDIO_CHROME, DEFAULT_STUDIO_DESIGN, contrastRatio } from '../utils/managedSitePresentation'
import { createFunnelSession } from '../server/managed-sites/funnel/session-service'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { prepareStudioIntake, projectStudioIntake, saveStudioReference, studioIntakeState } from '../server/managed-sites/funnel/studio-intake'
import { analyseStudioReference, extractStudioReference, studioReferenceUrl } from '../server/managed-sites/funnel/studio-reference'
import { generateStudioPreview, parseStudioRequest } from '../server/managed-sites/funnel/studio-preview'
import { studioModelFetch } from './fixtures/managed-site/studio-model'
import { confirmStudioProposal, generateAndStoreStudioProposal, restoreStudioProposal } from '../server/managed-sites/funnel/studio-proposal-service'
import { confirmedStudioProposal, compileConfirmedStudioBlueprint } from '../server/managed-sites/funnel/studio-state'
import { funnelSiteSpec } from '../server/managed-sites/funnel/quote-projection'
import { renderManagedSiteStaticAssets } from '../server/managed-sites/live-connectors/internal-broker/static-renderer'
import { compileManagedSiteBlueprint } from '../server/managed-sites/live-connectors/blueprint'
import { normalizeStudioMedia } from '../server/managed-sites/funnel/studio-media'
import { saveStudioMedia } from '../server/managed-sites/funnel/studio-intake'
import { isStudioPresentation } from '../utils/managedSitePresentation'
import { assertStudioFunctionalDelivery } from '../server/managed-sites/live-connectors/studio-delivery-check'
import { admitManagedSiteGenerationOutput, computeManagedSiteProviderManifestHash } from '../server/managed-sites/live-connectors/generation-artifact'
import sharp from 'sharp'

const configuration = { configured: true as const, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'isolated-test', apiKey: 'not-a-real-key', providerLabel: 'openai' as const, source: 'llm' as const }
const facts = { brandName: 'ÉCLAT', offer: 'Fine jewellery made for everyday wear.', audience: 'Women who prefer minimal jewellery', market: 'France', goal: 'sell_online', language: 'fr' }
async function fixture() {
  const { repository } = createFunnelSessionMemoryRepository()
  const { session } = await createFunnelSession(repository)
  return { repository, session }
}
const intakeFetch = (output: unknown) => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

describe('guided multilingual studio — isolated model and repository', () => {
  it.each(['en', 'fr', 'de', 'es-MX', 'pt-BR', 'ja', 'ko', 'ar', 'hi', 'zh-Hant', 'zh-Hans'])('accepts canonical language %s without conflating market or currency', language => {
    expect(normalizeSiteLanguage(language)).not.toBeNull()
  })
  it('rejects executable locale values and handles RTL without assuming all foreign languages are English', () => {
    expect(normalizeSiteLanguage('en\"><script>')).toBeNull()
    expect(siteTextDirection('ar')).toBe('rtl'); expect(siteTextDirection('ja')).toBe('ltr')
    expect(initialStudioLanguage('日本語のサイト')).toBe('ja')
  })
  it('uses already-known manual answers without a paid call and only asks missing essentials', async () => {
    const f = await fixture(), fetchImpl = vi.fn()
    const first = await prepareStudioIntake(f.session, { revision: 0, answers: { brandName: 'ÉCLAT', offer: facts.offer } }, f.repository, { fetchImpl })
    expect(first.questions.map(item => item.field)).toEqual(['audience', 'goal'])
    const latest = await f.repository.findSession(f.session.id)
    const ready = await prepareStudioIntake(latest!, { revision: 1, answers: facts }, f.repository, { fetchImpl })
    expect(ready.brief).toMatchObject({ brandName: 'ÉCLAT', language: 'fr', siteType: 'simple_commerce', guidedRevision: 2 })
    expect(ready.questions).toEqual([]); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('does not re-ask known fields even when the model tries to, and keeps explicit website language', async () => {
    const f = await fixture()
    await prepareStudioIntake(f.session, { revision: 0, answers: { brandName: 'ÉCLAT', language: 'ja' } }, f.repository)
    const current = (await f.repository.findSession(f.session.id))!
    const fetchImpl = intakeFetch({ schemaVersion: 'studio-intake-result-v1', language: 'fr', reply: 'Pour qui souhaitez-vous créer le site ?', intent: 'website', fields: [{ key: 'brandName', value: 'Wrong', evidence: 'jewellery' }, { key: 'offer', value: facts.offer, evidence: 'jewellery' }], questions: [{ field: 'brandName', prompt: 'Brand?' }, { field: 'audience', prompt: 'Pour qui ?' }] })
    const next = await prepareStudioIntake(current, { revision: 1, message: 'We sell jewellery.' }, f.repository, { configuration, fetchImpl })
    expect(next.facts.brandName).toBe('ÉCLAT'); expect(next.facts.language).toBe('ja'); expect(next.language).toBe('fr')
    expect(next.questions).toEqual([{ field: 'audience', prompt: 'Pour qui ?' }])
    const restored = projectStudioIntake(studioIntakeState((await f.repository.findSession(f.session.id))!))
    expect(restored.questions).toEqual(next.questions)
    expect(restored.reply).toBe(next.reply)
    const completed = await prepareStudioIntake(current, { revision: next.revision, answers: { audience: facts.audience, goal: 'build_brand' } }, f.repository)
    expect(completed.language).toBe('fr')
    expect(completed.brief!.language).toBe('ja')
    const changedDestination = await prepareStudioIntake(current, { revision: completed.revision, answers: { language: 'de' } }, f.repository)
    expect(changedDestination.language).toBe('fr')
    expect(changedDestination.brief!.language).toBe('de')
  })
  it('rejects a slow AI answer after a simultaneous manual update, without losing the newer facts', async () => {
    const f = await fixture()
    let finish!: () => void
    const delay = new Promise<void>(resolve => { finish = resolve })
    const fetchImpl: typeof fetch = async () => {
      await delay
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ schemaVersion: 'studio-intake-result-v1', language: 'en', reply: 'What do you offer?', intent: 'website', fields: [{ key: 'brandName', value: 'Old brand', evidence: 'Old brand' }], questions: [{ field: 'offer', prompt: 'What do you offer?' }] }) }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } })
    }
    const slow = prepareStudioIntake(f.session, { revision: 0, message: 'Our name is Old brand.' }, f.repository, { configuration, fetchImpl })
    await prepareStudioIntake(f.session, { revision: 0, answers: { brandName: 'New brand' } }, f.repository)
    finish()
    await expect(slow).rejects.toMatchObject({ statusCode: 409 })
    expect(studioIntakeState((await f.repository.findSession(f.session.id))!).facts.brandName).toBe('New brand')
  })
  it('refuses obvious off-topic requests with zero provider calls, no data mutation and no draft loss', async () => {
    const f = await fixture(), fetchImpl = vi.fn()
    const next = await prepareStudioIntake(f.session, { revision: 0, message: '幫我寫情書' }, f.repository, { configuration, fetchImpl })
    expect(next.status).toBe('off_topic'); expect(next.revision).toBe(0); expect(fetchImpl).not.toHaveBeenCalled()
    expect((await f.repository.findSession(f.session.id))!.answers).toEqual(f.session.answers)
  })
  it('model-classified off-topic input cannot save invented fields, including a mixed manual patch', async () => {
    const f = await fixture()
    const result = await prepareStudioIntake(f.session, { revision: 0, message: 'Raconte une histoire.', answers: { brandName: 'Wrong' } }, f.repository, { configuration, fetchImpl: intakeFetch({ schemaVersion: 'studio-intake-result-v1', language: 'fr', reply: 'Je peux vous aider à créer votre site.', intent: 'off_topic', fields: [], questions: [] }) })
    expect(result.facts).toEqual({}); expect(result.status).toBe('off_topic')
    expect(studioIntakeState((await f.repository.findSession(f.session.id))!).revision).toBe(0)
  })
  it('rejects unsupported fact evidence and stale revisions without overwriting persisted answers', async () => {
    const f = await fixture()
    await expect(prepareStudioIntake(f.session, { revision: 1, message: 'Hi' }, f.repository)).rejects.toMatchObject({ statusCode: 409 })
    await expect(prepareStudioIntake(f.session, { revision: 0, message: 'We sell jewellery.' }, f.repository, { configuration, fetchImpl: intakeFetch({ schemaVersion: 'studio-intake-result-v1', language: 'en', reply: 'Ready', intent: 'website', fields: [{ key: 'brandName', value: 'Invented', evidence: 'not supplied' }], questions: [] }) })).rejects.toMatchObject({ statusCode: 502 })
  })
  it('returns a model clarification without falling back to a template or overwriting a proposal', async () => {
    const f = await fixture()
    await expect(generateStudioPreview(f.session, parseStudioRequest({ brandName: 'ÉCLAT', brief: facts.offer, siteType: 'brand_blog', goal: 'build_brand', mode: 'ai' }), { providerConfiguration: configuration, fetchImpl: studioModelFetch(() => ({ schemaVersion: 'studio-guidance-v1', message: 'Which page would you like to change?' })) })).rejects.toMatchObject({ data: { code: 'STUDIO_GUIDANCE' } })
  })
  it('rejects edits outside the server-checked selected page', async () => {
    const f = await fixture(), input = { brandName: 'ÉCLAT', brief: facts.offer, siteType: 'brand_blog', goal: 'build_brand', mode: 'ai' }
    const initial = await generateStudioPreview(f.session, parseStudioRequest(input), { providerConfiguration: configuration, fetchImpl: studioModelFetch() })
    await expect(generateStudioPreview(f.session, parseStudioRequest({ ...input, revision: { instruction: 'Make the about page warmer.', pageKey: 'about', base: initial.editContext } }), { providerConfiguration: configuration, fetchImpl: studioModelFetch() })).rejects.toMatchObject({ data: { code: 'STUDIO_GUIDANCE' } })
  })
  it('keeps language, design, copy and approved reference through restore and confirmed compilation without another model call', async () => {
    const f = await fixture()
    await prepareStudioIntake(f.session, { revision: 0, answers: facts }, f.repository)
    let session = (await f.repository.findSession(f.session.id))!
    const reference = extractStudioReference('https://brand.example.com/', '<style>body{background:#f5eeee;font-family:Didot,serif;display:grid} a{color:#8f314f}</style>', [], true)
    await saveStudioReference(session, reference, 1, f.repository)
    session = (await f.repository.findSession(f.session.id))!
    const ready = projectStudioIntake(studioIntakeState(session))
    const fetchImpl = vi.fn(studioModelFetch())
    const draft = await generateAndStoreStudioProposal(session, { ...ready.brief!, mode: 'ai' }, f.repository, { providerConfiguration: configuration, fetchImpl })
    session = (await f.repository.findSession(f.session.id))!
    session = await confirmStudioProposal(session, { proposalId: draft.proposalId, preset: 'bloom' }, f.repository)
    expect(restoreStudioProposal(session)!.brief.language).toBe('fr')
    const proposal = confirmedStudioProposal(session.id, session.answers as any)!
    const spec = funnelSiteSpec(session.answers as any, session.id)
    expect(spec.locale).toBe('fr')
    const request = { schemaVersion: 'managed-site-generation-request-v1', ownerUserId: 1, projectId: 2, sourceVersionId: 3, siteSpec: spec, brandContent: {}, locale: spec.locale, selectedModules: spec.selectedModules, formEndpoint: null, templateIntent: 'astro', geoBrief: {}, evidenceConstraints: { evidenceSnapshotHash: 'a'.repeat(64), authoritySourceIds: [], limitations: [], humanReviewRequired: true }, requestFingerprint: 'b'.repeat(64), idempotencyKey: 'test' } as const
    const compiled = compileConfirmedStudioBlueprint(proposal, request as any)
    expect(compiled.studioPresentation!.design).toEqual(reference.design)
    expect(compiled.pages[0]!.title).toBe(proposal.blueprint.pages[0]!.title)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const rendered = renderManagedSiteStaticAssets(compiled, compileManagedSiteBlueprint(compiled), 'https://eclat-studio.com', 'bloom')[0]!.content
    expect(rendered).toContain('lang="fr"'); expect(rendered).toContain('layout-showcase'); expect(rendered).toContain('prefers-reduced-motion')
  })
  it('binds customer images into admitted immutable bytes, strips metadata, and never sends images to the model', async () => {
    const f = await fixture()
    await prepareStudioIntake(f.session, { revision: 0, answers: { ...facts, goal: 'build_brand' } }, f.repository)
    const bytes = await sharp({ create: { width: 640, height: 800, channels: 3, background: '#9d7b68' } }).jpeg().withMetadata().toBuffer()
    const media = await normalizeStudioMedia({ slot: 'hero', alt: 'Photographie de marque', rightsConfirmed: true, dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` })
    const metadata = await sharp(Buffer.from(media.dataUrl.split(',')[1]!, 'base64')).metadata()
    expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined(); expect(metadata.format).toBe('webp')
    await saveStudioMedia(f.session, media, 'hero', 1, f.repository)
    const ready = projectStudioIntake(studioIntakeState(f.session))
    expect(ready.media).toEqual([media])
    const fetchImpl = vi.fn(studioModelFetch())
    const draft = await generateAndStoreStudioProposal(f.session, { ...ready.brief!, mode: 'ai' }, f.repository, { providerConfiguration: configuration, fetchImpl })
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('data:image')
    expect(draft.designs[0]!.html).toContain(media.dataUrl)
    await confirmStudioProposal(f.session, { proposalId: draft.proposalId, preset: 'atelier' }, f.repository)
    const blueprint = confirmedStudioProposal(f.session.id, f.session.answers as any)!.blueprint
    const files = compileManagedSiteBlueprint(blueprint)
    expect(files.some(file => file.content.includes(media.sha256))).toBe(true)
    expect(() => admitManagedSiteGenerationOutput({ schemaVersion: 'managed-site-generation-provider-response-v1', providerKey: 'test', providerModel: 'test', providerRequestId: 'test', requestFingerprint: 'f'.repeat(64), files, manifestHash: computeManagedSiteProviderManifestHash(files) }, { requestFingerprint: 'f'.repeat(64), providerKey: 'test' })).not.toThrow()
    expect(() => assertStudioFunctionalDelivery(blueprint)).not.toThrow()
    const tampered = structuredClone(blueprint.studioPresentation!); tampered.media![0]!.dataUrl = 'https://tracker.invalid/photo.jpg'
    expect(isStudioPresentation(tampered)).toBe(false)
  })
  it('accepts a bounded brand-specific design without importing code, and uses a monogram when photos are absent', async () => {
    const f = await fixture()
    const design = { ...DEFAULT_STUDIO_DESIGN, canvas: '#10182e', ink: '#ffffff', accent: '#8ac9ba', typography: 'sans' as const, layout: 'structured' as const }
    let savedBlueprint: any
    const draft = await generateStudioPreview(f.session, parseStudioRequest({ brandName: 'ÉCLAT', brief: facts.offer, audience: facts.audience, siteType: 'brand_blog', goal: 'build_brand', language: 'fr', mode: 'ai' }), { providerConfiguration: configuration, fetchImpl: studioModelFetch(value => ({ ...value, design })), onBlueprint: value => { savedBlueprint = value } })
    expect(draft.source).toBe('llm'); expect(draft.design).toEqual(design)
    expect(draft.designs[0]!.html).toContain('layout-structured')
    const rendered = renderManagedSiteStaticAssets(savedBlueprint, compileManagedSiteBlueprint(savedBlueprint), 'https://eclat-studio.com')[0]!.content
    expect(rendered).not.toContain(EN_STUDIO_CHROME.imageNeeded)
    expect(rendered).toContain('ÉCLAT')
  })
  it('rejects executable model design fields rather than admitting them into the generated page', async () => {
    const f = await fixture()
    const draft = await generateStudioPreview(f.session, parseStudioRequest({ brandName: 'ÉCLAT', brief: facts.offer, siteType: 'brand_blog', goal: 'build_brand', language: 'fr', mode: 'ai' }), { providerConfiguration: configuration, fetchImpl: studioModelFetch(value => ({ ...value, design: { ...DEFAULT_STUDIO_DESIGN, canvas: 'url(https://attacker.invalid/)', css: 'EVIL_DESIGN' } })) })
    expect(draft.source).toBe('template')
    expect(JSON.stringify(draft.designs)).not.toMatch(/attacker|EVIL_DESIGN/)
  })
  it.each(['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/webp;base64,bm90YW5pbWFnZQ==', 'https://example.com/a.png'])('rejects non-raster or malformed uploaded images: %s', async dataUrl => {
    await expect(normalizeStudioMedia({ slot: 'hero', alt: 'Image', rightsConfirmed: true, dataUrl })).rejects.toMatchObject({ statusCode: 422 })
  })
  it('requires image-use permission and a current intake revision', async () => {
    await expect(normalizeStudioMedia({ slot: 'hero', alt: 'Image', rightsConfirmed: false, dataUrl: 'data:image/webp;base64,UklGR000' })).rejects.toMatchObject({ statusCode: 422 })
    const f = await fixture()
    await expect(saveStudioMedia(f.session, null, 'hero', 2, f.repository)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('never treats a selected commerce placeholder or inactive form as production ready', async () => {
    const f = await fixture()
    await prepareStudioIntake(f.session, { revision: 0, answers: facts }, f.repository)
    const draft = await generateAndStoreStudioProposal(f.session, { ...projectStudioIntake(studioIntakeState(f.session)).brief!, mode: 'ai' }, f.repository, { providerConfiguration: configuration, fetchImpl: studioModelFetch() })
    expect(draft.deliveryReview?.unactivatedModules).toContain('shopify_commerce')
    await confirmStudioProposal(f.session, { proposalId: draft.proposalId, preset: 'atelier' }, f.repository)
    const blueprint = confirmedStudioProposal(f.session.id, f.session.answers as any)!.blueprint
    expect(() => assertStudioFunctionalDelivery(blueprint)).toThrow(/functions are not activated/)
  })
  it('cannot confirm the non-AI guided layout as completed website copy', async () => {
    const f = await fixture()
    await prepareStudioIntake(f.session, { revision: 0, answers: facts }, f.repository)
    const draft = await generateAndStoreStudioProposal(f.session, { ...projectStudioIntake(studioIntakeState(f.session)).brief!, mode: 'template' }, f.repository)
    await expect(confirmStudioProposal(f.session, { proposalId: draft.proposalId, preset: 'atelier' }, f.repository)).rejects.toMatchObject({ data: { code: 'STUDIO_LAYOUT_ONLY' } })
  })
})

describe('public reference characteristics — no external network', () => {
  it.each(['http://example.com', 'https://127.0.0.1', 'https://169.254.169.254', 'https://example.com/?token=secret', 'https://user:pass@example.com', 'https://example.com:1234'])('rejects unsafe reference %s', url => expect(() => studioReferenceUrl(url)).toThrow())
  it('projects only bounded design traits, never third-party text, executable CSS, images or URLs', () => {
    const result = extractStudioReference('https://example.com/', '<h1>DO_NOT_COPY</h1><img src="https://tracker.invalid/a"><style>body{background:#ffffff;font-family:"Cormorant Garamond",serif;display:grid;color:#113355}a{color:#113355}@keyframes stolen{}</style><script>SECRET</script>', [], true)
    expect(result.palette).toContain('#113355'); expect(result.fonts).toContain('Cormorant Garamond'); expect(result.signals.hasCssAnimation).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_COPY|tracker|SECRET|@keyframes/)
    expect(contrastRatio(result.design.canvas, result.design.ink)).toBeGreaterThanOrEqual(4.5)
  })
  it('honours robots restrictions and never fetches unrelated hosts or CSS imports', async () => {
    const blocked = vi.fn(async (url: string) => ({ status: 200, type: 'text/plain', body: 'User-agent: *\nDisallow: /', url }))
    await expect(analyseStudioReference('https://example.com/', { fetchResource: blocked })).rejects.toMatchObject({ statusCode: 422 })
    expect(blocked).toHaveBeenCalledTimes(1)
    const allowed = vi.fn(async (url: string) => ({ status: 200, type: url.endsWith('robots.txt') ? 'text/plain' : 'text/html', body: url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : '<link rel="stylesheet" href="https://other.example.com/a.css"><style>body{color:#123456}</style>', url }))
    const result = await analyseStudioReference('https://example.com/', { fetchResource: allowed })
    expect(result.status).toBe('partial'); expect(allowed).toHaveBeenCalledTimes(2)
  })
})
