import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFunnelSession, saveFunnelStep, recordFunnelConsent, MANAGED_SITE_FUNNEL_CONSENT_VERSION, type FunnelAnswers } from '../server/managed-sites/funnel/session-service'
import { confirmStudioProposal, generateAndStoreStudioProposal, restoreStudioProposal, studioSessionProjection } from '../server/managed-sites/funnel/studio-proposal-service'
import { confirmedStudioProposal } from '../server/managed-sites/funnel/studio-state'
import { parseStudioRequest } from '../server/managed-sites/funnel/studio-preview'
import { projectStudioCopy } from '../server/managed-sites/funnel/studio-intelligence'
import { funnelSessionRevision } from '../server/managed-sites/funnel/session-repository'
import { runFunnelBuild, runFunnelCheckout } from '../server/managed-sites/funnel/checkout-orchestrator'
import { advancePaidManagedSiteFunnel } from '../server/managed-sites/funnel/fulfilment-advancer'
import { createMemoryManagedSiteArtifactVault, createMockRawBodyPaymentWebhookAdapter } from '../server/managed-sites/live-connectors/adapters'
import { createMockManagedSiteDeploymentAdapter } from '../server/managed-sites/live-connectors/deployment-orchestrator'
import { createMockManagedSiteCheckoutSessionAdapter } from '../server/managed-sites/live-connectors/checkout-session'
import { configureManagedSiteProvider } from '../server/managed-sites/live-connectors/provider-registry'
import { createManagedSiteDomainPurchaseIntent, createMockManagedSiteDnsTlsAdapter, createMockManagedSiteDomainAdapter, managedSiteDomainConfirmationFingerprint, quoteManagedSiteDomain } from '../server/managed-sites/live-connectors/domain-connectors'
import { processManagedSiteRawPaymentWebhook } from '../server/managed-sites/live-connectors/payment-webhook'
import { renderManagedSiteStaticAssets } from '../server/managed-sites/live-connectors/internal-broker/static-renderer'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { createLiveConnectorMemoryRepository } from './fixtures/managed-site/live-connectors-repository'
import { createManagedSiteMemoryRepository } from './fixtures/managed-site/repository'
import { createOrderingMemoryRepository } from './fixtures/managed-site/ordering-repository'
import { managedSiteExactPaymentWebhookPayload, managedSiteFixedNow } from './fixtures/managed-site/live-connectors-application'
import { studioModelFetch } from './fixtures/managed-site/studio-model'
import { EN_STUDIO_CHROME, DEFAULT_STUDIO_DESIGN } from '../utils/managedSitePresentation'

const clock = () => new Date(managedSiteFixedNow)
const brief = { brandName: '日光顧問', brief: '提供品牌策略顧問服務，讓訪客提出合作需求。', siteType: 'brand_blog', goal: 'increase_inquiries', mode: 'ai' } as const
const providerConfiguration = { configured: true as const, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'test-only', apiKey: 'isolated-test-only', providerLabel: 'openai' as const, source: 'llm' as const }
afterEach(() => vi.unstubAllEnvs())

async function fixture(siteType = brief.siteType as 'one_page' | 'brand_blog' | 'simple_commerce', language?: string) {
  // Inquiry sites now include their real first-party form without asking the customer to select it again.
  vi.stubEnv('NUXT_MANAGED_SITE_FORM_TOKEN_PEPPER', 'isolated-studio-test-pepper')
  vi.stubEnv('DISCOVERYSTACK_MANAGED_SITE_FORM_INGEST_ORIGIN', 'https://forms.acme.taipei')
  const managed = createManagedSiteMemoryRepository(), ordering = createOrderingMemoryRepository(), live = createLiveConnectorMemoryRepository()
  const funnel = createFunnelSessionMemoryRepository({ projects: () => managed.state.projects, audits: () => managed.state.audits, fulfilmentCandidates: () => funnel.state.sessions.filter(row => row.releaseId).map(row => ({ ...row, ownerUserId: 1 })) })
  const created = await createFunnelSession(funnel.repository, clock)
  const fetchImpl = vi.fn(studioModelFetch())
  const draft = await generateAndStoreStudioProposal(created.session, parseStudioRequest({ ...brief, siteType, ...(language ? { language } : {}) }), funnel.repository, { providerConfiguration, fetchImpl, clock })
  const confirmed = await confirmStudioProposal(created.session, { proposalId: draft.proposalId, preset: 'bloom' }, funnel.repository, clock)
  await saveFunnelStep(created.sessionId, created.sessionToken, { step: 9, answers: { contact: { contactName: 'Test customer', email: 'test@example.test' }, domain: { option: 'new', name: 'confirmed-studio', tld: 'com' }, plan: { planKey: 'site_only', cadenceDays: 7 } } }, funnel.repository, clock)
  await recordFunnelConsent(created.sessionId, created.sessionToken, { policyVersion: MANAGED_SITE_FUNNEL_CONSENT_VERSION, scrolledToBottom: true }, funnel.repository, clock)
  for (const [capability, providerKey] of [['deployment', 'mock-deployment'], ['payment', 'mock-payment'], ['domain_registration', 'mock-domain'], ['dns_tls', 'mock-dns-tls']] as const) {
    await configureManagedSiteProvider(1, { capability, providerKey, readinessStatus: 'mock', credentialReference: null, transportConfiguration: {}, idempotencyKey: `studio-${capability}` }, live.repository, clock)
  }
  // Deliberately no website_generator configuration: compiling confirmed copy needs no model.
  const generate = vi.fn(async (): Promise<never> => { throw new Error('Must never regenerate confirmed copy') })
  const vault = createMemoryManagedSiteArtifactVault()
  const deployment = createMockManagedSiteDeploymentAdapter({ now: clock })
  const dependencies = { funnelRepository: funnel.repository, orderingRepository: ordering.repository, managedRepository: managed.repository, connectorRepository: live.repository, generationAdapter: { generate }, artifactVault: vault, deploymentAdapter: deployment, checkoutAdapter: createMockManagedSiteCheckoutSessionAdapter(), executionMode: 'mocked' as const, clock, resolveOwnerUserId: async () => 1 }
  return { managed, ordering, live, funnel, created, confirmed, draft, fetchImpl, generate, vault, deployment, dependencies }
}

describe('confirmed studio copy into the real governed delivery pipeline (isolated providers)', () => {
  it('keeps the new brand renderer, selected composition and copy through confirmation, build and immutable release without another AI call', async () => {
    const f = await fixture('brand_blog', 'en')
    expect(f.draft.designs.every(design => design.html.includes('data-studio-renderer="brand-studio-v2"'))).toBe(true)
    await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)
    const candidate = f.live.state.candidates[0]!
    const stored = await f.vault.lookupImmutableCandidate({ ownerUserId: 1, projectId: candidate.projectId, requestFingerprint: candidate.requestFingerprint })
    const bundle = stored!.bundle as any
    expect(bundle.blueprint.studioPresentation.renderer).toBe('brand-studio-v2')
    expect(bundle.blueprint.customerSitePreset).toBe('bloom')
    expect(projectStudioCopy(bundle.blueprint)).toEqual(f.draft.editContext)
    const home = renderManagedSiteStaticAssets(bundle.blueprint, bundle.files).find(file => file.path === 'index.html')!.content
    expect(home).toContain('data-studio-renderer="brand-studio-v2"')
    expect(home).toContain('class="layout-showcase')
    expect(f.live.state.releases[0]!.contentHash).toBe(candidate.contentHash)
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
    expect(f.generate).not.toHaveBeenCalled()
  })
  it('blocks payment creation for a guided artifact whose commerce is still a placeholder', async () => {
    const f = await fixture('simple_commerce')
    await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)
    const blueprint = (f.live.state.candidates[0]!.manifest as any).blueprint
    blueprint.studioPresentation = { version: 'studio-presentation-v1', design: DEFAULT_STUDIO_DESIGN, chrome: EN_STUDIO_CHROME }
    const createCheckout = vi.fn(async (): Promise<never> => { throw new Error('Payment must not start') })
    await expect(runFunnelCheckout(f.created.sessionId, f.created.sessionToken, { ...f.dependencies, checkoutAdapter: { createCheckout } as any })).rejects.toMatchObject({ data: { code: 'STUDIO_FUNCTIONS_NOT_ACTIVATED' } })
    expect(createCheckout).not.toHaveBeenCalled()
  })
  it('builds the explicitly accepted revision and binds selected design into immutable content bytes', async () => {
    const f = await fixture()
    const revised = await generateAndStoreStudioProposal(f.created.session, { ...brief, revision: { proposalId: f.draft.proposalId, instruction: '首頁標題改得更親切', base: f.draft.editContext! } }, f.funnel.repository, { providerConfiguration, fetchImpl: f.fetchImpl, clock })
    // Generating a suggestion cannot silently change the existing customer confirmation.
    expect(restoreStudioProposal(f.created.session)!.preview.proposalId).toBe(f.draft.proposalId)
    await confirmStudioProposal(f.created.session, { proposalId: revised.proposalId, preset: 'alignment' }, f.funnel.repository, clock)
    await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)
    const candidate = f.live.state.candidates[0]!
    const stored = await f.vault.lookupImmutableCandidate({ ownerUserId: 1, projectId: candidate.projectId, requestFingerprint: candidate.requestFingerprint })
    const bundle = stored!.bundle as any
    expect(projectStudioCopy(bundle.blueprint)).toEqual(revised.editContext)
    expect(bundle.blueprint.customerSitePreset).toBe('alignment')
    expect(bundle.files.some((file: any) => file.content.includes('alignment'))).toBe(true)
    expect(renderManagedSiteStaticAssets(bundle.blueprint, bundle.files)[0]!.content).toContain('data-site-preset="alignment"')
    expect(f.fetchImpl).toHaveBeenCalledTimes(2)
    expect(f.generate).not.toHaveBeenCalled()
  })

  it('adds only server-owned live contact form slots without changing confirmed public copy', async () => {
    vi.stubEnv('NUXT_MANAGED_SITE_FORM_TOKEN_PEPPER', 'isolated-studio-test-pepper')
    vi.stubEnv('DISCOVERYSTACK_MANAGED_SITE_FORM_INGEST_ORIGIN', 'https://forms.acme.taipei')
    const f = await fixture()
    await saveFunnelStep(f.created.sessionId, f.created.sessionToken, { step: 5, answers: { modules: ['contact_lead_capture'] } }, f.funnel.repository, clock)
    expect(studioSessionProjection(f.created.session).studio?.confirmed).toBe(true)
    await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)
    const blueprint = (f.live.state.candidates[0]!.manifest as any).blueprint
    expect(projectStudioCopy(blueprint)).toEqual(f.draft.editContext)
    const form = blueprint.pages.flatMap((page: any) => page.sections).find((section: any) => section.kind === 'contact_form')
    expect(form.formEndpoint).toMatch(/^https:\/\/forms\.acme\.taipei\/api\/managed-sites\/site-forms\/[a-f0-9]{64}\/submit$/u)
    expect(f.managed.state.projects[0]!.contactFormTokenHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(f.draft)).not.toContain('isolated-studio-test-pepper')
  })

  it.each(['one_page', 'brand_blog', 'simple_commerce'] as const)('keeps every %s copy field through restore, compiler, vault, release and retry without regeneration', async siteType => {
    const f = await fixture(siteType)
    const restored = restoreStudioProposal(f.created.session)!
    expect(restored.preview.editContext).toEqual(f.draft.editContext)
    expect(restored.preset).toBe('bloom')
    expect(restored.preview.pages).toHaveLength(siteType === 'one_page' ? 1 : siteType === 'brand_blog' ? 6 : 5)
    expect(studioSessionProjection(f.created.session).answers).not.toHaveProperty('studio')
    const built = await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)
    const candidate = f.live.state.candidates[0]!
    expect(candidate.providerKey).toBe('first_party_confirmed_studio')
    expect(projectStudioCopy((candidate.manifest as any).blueprint)).toEqual(f.draft.editContext)
    expect(f.live.state.releases[0]!.contentHash).toBe(candidate.contentHash)
    const bundle = await f.vault.lookupImmutableCandidate({ ownerUserId: 1, projectId: candidate.projectId, requestFingerprint: candidate.requestFingerprint })
    expect(projectStudioCopy((bundle!.bundle as any).blueprint)).toEqual(f.draft.editContext)
    // The broker renders only the immutable bundle, with no browser-provided preset argument.
    const assets = renderManagedSiteStaticAssets((bundle!.bundle as any).blueprint, (bundle!.bundle as any).files)
    expect(assets.find(asset => asset.path === 'index.html')!.content).toContain('data-site-preset="bloom"')
    expect(await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)).toMatchObject({ releaseId: built.releaseId })
    expect(f.generate).not.toHaveBeenCalled()
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
    expect(f.live.state.candidates).toHaveLength(1)
    expect(f.live.state.receipts.some(row => row.receiptType === 'production_deployment_verified')).toBe(false)
  })

  it('advances the same confirmed content hash through approval, signed payment, domain, DNS/TLS and production receipt', async () => {
    const f = await fixture()
    await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)
    await runFunnelCheckout(f.created.sessionId, f.created.sessionToken, f.dependencies)
    const release = f.live.state.releases[0]!, order = f.ordering.state.orders[0]!, quote = f.ordering.state.quotes[0]!
    const secret = 'isolated-studio-payment'
    const event = await managedSiteExactPaymentWebhookPayload({ live: f.live, ownerUserId: 1, release: { release }, order: { order }, quote: { quote } } as any, { providerEventId: 'studio-paid', eventType: 'checkout_succeeded' })
    const rawBody = Buffer.from(JSON.stringify(event))
    const jointTransaction = async (work: any) => work({ connector: f.live.repository, ordering: f.ordering.repository, managed: f.managed.repository })
    await processManagedSiteRawPaymentWebhook({ rawBody, signatureHeader: createHmac('sha256', secret).update(rawBody).digest('hex'), credentialReference: 'vault:studio-test-payment', executionMode: 'mocked' }, createMockRawBodyPaymentWebhookAdapter('mock-payment'), { jointTransaction, credentialResolver: async () => ({ ok: true, value: secret }), clock })
    const domainAdapter = createMockManagedSiteDomainAdapter({ now: clock })
    const quoted = await quoteManagedSiteDomain(1, { projectId: release.projectId, releaseId: release.id, requestedDomain: release.canonicalDomain, executionMode: 'mocked', idempotencyKey: 'studio-domain' }, domainAdapter, { repository: f.live.repository, managedRepository: f.managed.repository, clock })
    const paid = f.live.state.receipts.find(row => row.receiptType === 'release_payment_bound')!
    const ownerConfirmationFingerprint = managedSiteDomainConfirmationFingerprint({ ownerUserId: 1, projectId: release.projectId, releaseId: release.id, commerceSnapshotFingerprint: release.commerceSnapshotFingerprint!, quoteReceiptFingerprint: quoted.receiptFingerprint!, draftOrderId: order.id, paymentReceiptFingerprint: paid.receiptFingerprint })
    await createManagedSiteDomainPurchaseIntent(1, { projectId: release.projectId, releaseId: release.id, draftOrderId: order.id, quoteReceiptFingerprint: quoted.receiptFingerprint!, paymentReceiptFingerprint: paid.receiptFingerprint, ownerConfirmationFingerprint, executionMode: 'mocked', idempotencyKey: 'studio-domain-purchase' }, domainAdapter, { repository: f.live.repository, managedRepository: f.managed.repository, clock })
    const deploy = vi.fn(f.deployment.deployProduction)
    const fulfilment = { funnelRepository: f.funnel.repository, repository: f.live.repository, orderingRepository: f.ordering.repository, managedRepository: f.managed.repository, executionMode: 'mocked' as const, clock, productionTransaction: async (work: any) => work({ repository: f.live.repository, orderingRepository: f.ordering.repository, managedRepository: f.managed.repository }), deploymentAdapter: async () => ({ ...f.deployment, deployProduction: deploy }), dnsTlsAdapter: async () => createMockManagedSiteDnsTlsAdapter(), bootstrapCustomerWorkspace: vi.fn(async () => ({ replayed: false })) as any, notifyCustomerWorkspace: vi.fn(async () => ({ sent: true })) as any }
    expect(await advancePaidManagedSiteFunnel({}, fulfilment)).toMatchObject({ advanced: 1, failed: 0 })
    expect(f.live.state.releases[0]!.status).toBe('live_verified')
    const receipt = f.live.state.receipts.find(row => row.receiptType === 'production_deployment_verified')!
    expect(receipt.contentHash).toBe(f.live.state.candidates[0]!.contentHash)
    expect(projectStudioCopy((f.live.state.candidates[0]!.manifest as any).blueprint)).toEqual(f.draft.editContext)
    await advancePaidManagedSiteFunnel({}, fulfilment)
    expect(deploy).toHaveBeenCalledTimes(1)
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
    expect(f.generate).not.toHaveBeenCalled()
  })

  it('rejects client-authoritative snapshots, foreign proposal identities and tampered revision bases before AI', async () => {
    const f = await fixture()
    await expect(saveFunnelStep(f.created.sessionId, f.created.sessionToken, { step: 1, answers: { studio: (f.created.session.answers as FunnelAnswers).studio } }, f.funnel.repository, clock)).rejects.toMatchObject({ statusCode: 422 })
    const other = await createFunnelSession(f.funnel.repository, clock)
    await expect(confirmStudioProposal(other.session, { proposalId: f.draft.proposalId, preset: 'atelier' }, f.funnel.repository, clock)).rejects.toMatchObject({ statusCode: 409 })
    const copy = structuredClone(f.draft.editContext!); copy.pages[0]!.title = '未經確認的內容'
    await expect(generateAndStoreStudioProposal(f.created.session, { ...brief, revision: { instruction: '修改標題', proposalId: f.draft.proposalId, base: copy } }, f.funnel.repository, { providerConfiguration, fetchImpl: f.fetchImpl, clock })).rejects.toMatchObject({ statusCode: 409 })
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('invalidates changed requirements before build and freezes the confirmed proposal after formal build starts', async () => {
    const f = await fixture()
    const answers = f.created.session.answers as FunnelAnswers
    await saveFunnelStep(f.created.sessionId, f.created.sessionToken, { step: 2, answers: { company: { ...answers.company!, whatWeDo: 'Changed public brief' } } }, f.funnel.repository, clock)
    expect(studioSessionProjection(f.created.session).studio?.confirmed).toBe(false)
    await expect(runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.managed.state.projects).toHaveLength(0)
    await confirmStudioProposal(f.created.session, { proposalId: f.draft.proposalId, preset: 'bloom' }, f.funnel.repository, clock)
    await runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)
    await expect(confirmStudioProposal(f.created.session, { proposalId: f.draft.proposalId, preset: 'atelier' }, f.funnel.repository, clock)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects a late generation or stale CAS without overwriting newer answers', async () => {
    const f = await fixture()
    const expected = funnelSessionRevision(f.created.session)
    let ready!: () => void, finish!: () => void
    const entered = new Promise<void>(resolve => { ready = resolve })
    const resume = new Promise<void>(resolve => { finish = resolve })
    const transport = studioModelFetch()
    const fetchImpl = vi.fn(async (...args: Parameters<typeof fetch>) => { ready(); await resume; return transport(...args) })
    const pending = generateAndStoreStudioProposal(f.created.session, { ...brief }, f.funnel.repository, { providerConfiguration, fetchImpl, clock })
    await entered
    await saveFunnelStep(f.created.sessionId, f.created.sessionToken, { step: 2, answers: { contact: { contactName: 'Newer contact', email: 'new@example.test' } } }, f.funnel.repository, clock)
    finish()
    await expect(pending).rejects.toMatchObject({ statusCode: 409 })
    expect(await f.funnel.repository.transitionSession(f.created.sessionId, 'active', { answers: {} }, expected)).toBeNull()
    expect((f.created.session.answers as FunnelAnswers).contact?.contactName).toBe('Newer contact')
    expect(confirmedStudioProposal(f.created.sessionId, f.created.session.answers as FunnelAnswers)?.id).toBe(f.draft.proposalId)
  })

  it('fails before creating a project when answers change while the build acquires dependencies', async () => {
    const f = await fixture()
    f.dependencies.resolveOwnerUserId = async () => {
      await saveFunnelStep(f.created.sessionId, f.created.sessionToken, { step: 2, answers: { contact: { contactName: 'Changed concurrently', email: 'new@example.test' } } }, f.funnel.repository, clock)
      return 1
    }
    await expect(runFunnelBuild(f.created.sessionId, f.created.sessionToken, f.dependencies)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.managed.state.projects).toHaveLength(0)
    expect(f.created.session.status).toBe('active')
  })
})
