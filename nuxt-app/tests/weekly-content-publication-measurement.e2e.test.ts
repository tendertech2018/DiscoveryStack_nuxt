import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createGeoFlowQwenGenerationRuntime } from '../server/geoflow-runtime/qwen'
import type { GeoRewriteAdapter } from '../server/geo/contracts'
import { enableOwnerAutopilot } from '../server/content-operations/autopilot-service'
import { saveOwnerEntityStrategyProfile, saveOwnerQueryOwnership } from '../server/content-operations/governance-service'
import { createOwnerPublicationTarget, executeContentOperationEntry, runOwnerContentEntryWorkflow } from '../server/content-operations/orchestrator'
import { buildOwnerContentLearningDataset } from '../server/content-operations/service'
import { checkOwnerSitePublication } from '../server/content-operations/site-publication'
import { confirmOwnerSiteMeasurement, projectSiteMeasurement, resolveConfirmedSiteMeasurementLineages } from '../server/content-operations/site-measurement'
import { processMeasurementRun, scheduleMeasurementForEntry } from '../server/measurement-collection/service'
import type { MeasurementConnectionRow, MeasurementRepository, MeasurementRunRow, MeasurementSnapshotRow } from '../server/measurement-collection/types'
import type { FirstPartyFetch } from '../server/first-party-publishing/types'
import { createInitialWeeklyCalendar, rollApprovedWeeklyCalendar } from '../server/weekly-content/planner'
import { processWeeklyLineWebhook } from '../server/weekly-content/line-webhook'
import { runWeeklyLineOutbox } from '../server/weekly-content/runtime-line'
import { runWeeklyContentTick, type WeeklyRuntimeDependencies } from '../server/weekly-content/runtime'
import { activateWeeklyReviewConfig, deriveReviewTokens, issueLineBindingInvite } from '../server/weekly-content/service'
import { encodeWeeklyLinePostback } from '../server/weekly-content/line-transport'
import { weeklyConsentAllowsPublication } from '../server/weekly-content/publication-guard'
import type { WeeklyDraft } from '../server/weekly-content/types'
import { ContentOperationsFixture } from './fixtures/content-operations/repository'
import { WEEKLY_KEY, WEEKLY_NOW, WeeklyFixture } from './fixtures/weekly-content/repository'

const OWNER = 1
const CLIENT = 1
const LINE_USER = `U${'1'.repeat(32)}`
const LINE_BOT = `U${'2'.repeat(32)}`
const LINE_SECRET = 'synthetic-line-signature-secret'
const SITE_SECRET = 'synthetic-site-status-secret-000000000000'
const SITE_NOW = new Date(WEEKLY_NOW.getTime() + 60_000)
const MEASUREMENT_NOW = new Date('2026-10-20T09:00:00.000Z')
const DOCUMENT_HASH = 'c'.repeat(64)
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

function signedLine(events: unknown[]) {
  const rawBody = Buffer.from(JSON.stringify({ destination: LINE_BOT, events }))
  return { rawBody, signature: createHmac('sha256', LINE_SECRET).update(rawBody).digest('base64') }
}

function lineWebhookOptions(weekly: WeeklyFixture) {
  return { featureEnabled: true, channelSecret: LINE_SECRET, botUserId: LINE_BOT, getDependencies: vi.fn(async () => weekly.deps()) }
}

function providerRuntime(fixture: ContentOperationsFixture) {
  const body = '# Fixture Brand 的 opportunity-1 內容策略\n\nFixture Brand 以 opportunity-1 回答內容策略問題，以下只整理已核准資料與適用範圍。[cite:1]\n\n## 可核對的依據\n\n這份合成內容不新增外部事實，來源、語言與頁面路徑都維持在核准 evidence 邊界內。\n\n## 下一步\n\nOwner 可依 canonical pillar page 與 approved facts 再次核對內容，再由 policy-governed runtime 決定是否送出私人草稿。'
  const qwenFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'qwen-plus', choices: [{ message: { content: body } }] }), { status: 200 }))
  const qwenRuntime = createGeoFlowQwenGenerationRuntime({
    endpoint: 'https://ws-fixture1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    credentialRef: 'ref-synthetic-qwen', resolveCredential: async () => 'synthetic-qwen-secret',
    fetchImpl: qwenFetch as typeof fetch, now: () => WEEKLY_NOW.toISOString(),
  })
  const autoGeoTransport = vi.fn()
  const optimizationAdapter: GeoRewriteAdapter = {
    id: 'custom', version: 'synthetic-autogeo-transport-v1',
    async rewrite(document, rules) {
      autoGeoTransport()
      return { provider: 'autogeo-bailian-qwen', providerVersion: 'qwen-plus', optimizedTitle: document.title,
        optimizedContent: document.content, appliedRuleIds: rules.map(rule => rule.id), safetyNotes: ['isolated transport'],
        provenance: { execution: 'autogeo-framework-bailian-qwen', providerExecution: true, requestedProvider: 'autogeo-bailian-qwen',
          model: 'qwen-plus', upstreamRepository: 'cxcscmu/AutoGEO', upstreamRevision: 'isolated-test', rewriteMethod: 'autogeo_api',
          ruleset: 'Researchy-GEO / Gemini default rules' } }
    },
  }
  return { productionRuntime: { qwenRuntime, optimizationAdapter, productionPersistence: fixture.productionPersistence() }, qwenFetch, autoGeoTransport }
}

function measurementRepository(client: { id: number; timeZone: string }, target: { id: number }, canonicalPage: string) {
  const connection = { id: 1, ownerUserId: OWNER, clientId: client.id, publicationTargetId: target.id,
    source: 'google_search_console', activeSource: 'google_search_console', status: 'configured', credentialReference: 'ref-synthetic-google',
    googleSearchConsoleProperty: 'https://doalignment.com', ga4PropertyId: null, llmVisibilityProjectId: null,
    canonicalOrigin: 'https://doalignment.com', timeZone: client.timeZone, allowedPageScope: [canonicalPage], sourceAvailabilityLagDays: 0,
    providerTargets: null, idempotencyKey: 'same-lineage-google', configurationFingerprint: 'e'.repeat(64), connectedAt: MEASUREMENT_NOW,
    revokedAt: null, websiteIdentity: `target:${target.id}`, createdAt: MEASUREMENT_NOW, updatedAt: MEASUREMENT_NOW } as MeasurementConnectionRow
  const runs: MeasurementRunRow[] = []
  const snapshots: MeasurementSnapshotRow[] = []
  const repository = {
    async listConnections() { return [connection] },
    async listRuns() { return runs },
    async findRunByIdempotency(_owner: number, key: string) { return runs.find(run => run.idempotencyKey === key) ?? null },
    async insertRun(input: Omit<MeasurementRunRow, 'id' | 'createdAt' | 'updatedAt'>) { const row = { ...input, id: runs.length + 1, createdAt: MEASUREMENT_NOW, updatedAt: MEASUREMENT_NOW }; runs.push(row); return row },
    async findRun(_owner: number, id: number) { return runs.find(run => run.id === id) ?? null },
    async updateRun(_owner: number, id: number, patch: Partial<MeasurementRunRow>) { const row = runs.find(run => run.id === id)!; Object.assign(row, patch, { updatedAt: MEASUREMENT_NOW }); return row },
    async acquireRunLease(_owner: number, id: number) { const row = runs.find(run => run.id === id)!; row.state = 'processing'; row.attemptNumber++; return row },
    async releaseRunLease(_owner: number, id: number, _lease: string, state: MeasurementRunRow['state'], _now: Date, patch: Partial<MeasurementRunRow>) { const row = runs.find(run => run.id === id)!; Object.assign(row, patch, { state, updatedAt: MEASUREMENT_NOW }); return row },
    async findConnection() { return connection },
    async updateConnection(_owner: number, _id: number, patch: Partial<MeasurementConnectionRow>) { Object.assign(connection, patch); return connection },
    async findSnapshot(_owner: number, runId: number, phase: string) { return snapshots.find(row => row.runId === runId && row.phase === phase) ?? null },
    async listSnapshots(_owner: number, runId?: number) { return runId === undefined ? snapshots : snapshots.filter(row => row.runId === runId) },
    async insertSnapshot(input: Omit<MeasurementSnapshotRow, 'id' | 'createdAt'>) { const row = { ...input, id: snapshots.length + 1, createdAt: MEASUREMENT_NOW }; snapshots.push(row); return row },
  } as unknown as MeasurementRepository
  return { repository, connection, runs, snapshots }
}

async function setupLineage() {
  const operations = new ContentOperationsFixture()
  operations.evidenceApprovalAt = WEEKLY_NOW.toISOString()
  const client = operations.addClient(OWNER)
  Object.assign(client, { id: CLIENT, canonicalSiteOrigin: 'https://doalignment.com', framework: 'nextjs',
    publicationTransport: 'first_party_signed_api', timeZone: 'Asia/Taipei', defaultCadenceDays: 7,
    defaultPublishLocalTime: '09:00', monthlyBudgetUnits: 10, requireCustomerApproval: true })
  const bundle = operations.addPlan(OWNER, 1)
  Object.assign(bundle.plan, { language: 'zh-hant' })
  for (const deliverable of bundle.deliverables) Object.assign(deliverable, { language: 'zh-hant' })
  const createdTarget = await createOwnerPublicationTarget(OWNER, client.id, {
    idempotencyKey: 'same-lineage-next-target', framework: 'nextjs', transport: 'first_party_signed_api',
    targetOrigin: client.canonicalSiteOrigin, contentRoot: 'journal', endpointPath: '/api/first-party/content-ingest',
    credentialReference: 'ref-same-lineage-site', allowedContentTypes: ['article'], allowedLanguages: ['zh-hant'],
    maximumPayloadBytes: 100_000, executionEnabled: true,
  }, operations.repository)
  const target = operations.targets.find(row => row.id === createdTarget.target.id)!
  const profile = await saveOwnerEntityStrategyProfile(OWNER, client.id, { targetRowId: target.id, idempotencyKey: 'same-lineage-profile',
    canonicalBrandName: 'Fixture Brand', brandAliases: [], canonicalWebsiteOrigin: client.canonicalSiteOrigin, businessType: 'services',
    primaryLocale: 'zh-hant', secondaryLocales: [], primaryLocations: [], serviceAreas: [], primaryServices: ['content strategy'],
    secondaryServices: [], targetAudience: ['owners'], primaryQueryClusters: ['opportunity-1'], supportingQueryClusters: [],
    canonicalPillarPages: [`${client.canonicalSiteOrigin}/pillar`], servicePageBindings: {}, approvedBrandFacts: ['Fixture Brand provides content strategy.'],
    approvedDifferentiators: [], prohibitedClaims: ['guaranteed results'], preferredTone: 'clear', requiredDisclosures: [],
    internalLinkPolicy: 'canonical links only', structuredDataIdentity: { name: 'Fixture Brand' }, evidenceSnapshotHash: bundle.plan.evidenceSnapshotHash,
  }, operations.repository, WEEKLY_NOW)
  await saveOwnerQueryOwnership(OWNER, client.id, { targetRowId: target.id, idempotencyKey: 'same-lineage-query',
    ownerPageId: `${client.canonicalSiteOrigin}/pillar`, normalizedQuery: 'opportunity-1', queryCluster: 'opportunity-1',
    supportingArticleIds: [], evidenceSnapshotHash: bundle.plan.evidenceSnapshotHash }, operations.repository, WEEKLY_NOW)
  await enableOwnerAutopilot(OWNER, client.id, { policyVersion: 'governed-autopilot-policy-v4', targetRowId: target.id,
    entityStrategyProfileId: profile.profile.profileId, mode: 'balanced', expiresAt: '2027-01-01T00:00:00.000Z',
    allowedContentTypes: ['article'], allowedLanguages: ['zh-hant'], allowedDestinations: [target.targetId], allowedCadences: [7],
    allowedRiskClasses: ['general'], allowedProviderModels: ['bailian:qwen-plus'], evidenceFreshnessHours: 720,
    maximumRepairAttempts: 1, maximumTopicSubstitutions: 0, generationBudget: 2, publicationBudget: 2,
  }, operations.repository, WEEKLY_NOW)
  const policy = operations.autopilotPolicies[0]!

  const weekly = new WeeklyFixture()
  Object.assign(weekly.state.client, client)
  weekly.state.target = target
  weekly.state.policy = policy
  vi.mocked(weekly.repository.getTargetPolicy).mockImplementation(async (owner, clientId, targetId, policyId) =>
    owner === OWNER && clientId === client.id && targetId === target.id && policyId === policy.policyId ? { target, policy } : null)
  const weeklyDeps = weekly.deps()
  await activateWeeklyReviewConfig({ ownerUserId: OWNER, clientId: client.id, publicationTargetId: target.id,
    policyId: policy.policyId, idempotencyKey: 'same-lineage-weekly' }, weeklyDeps)
  const invite = await issueLineBindingInvite({ ownerUserId: OWNER, clientId: client.id }, weeklyDeps)
  const bindEvent = { type: 'message', mode: 'active', timestamp: WEEKLY_NOW.getTime(), source: { type: 'user', userId: LINE_USER },
    webhookEventId: '01FZ74A0TDDPYRVKNK77XKC3ZR', message: { type: 'text', text: invite.invitationToken } }
  await processWeeklyLineWebhook({ ...lineWebhookOptions(weekly), ...signedLine([bindEvent]) })
  operations.repository.assertWeeklyWorkflowActive = async (owner, clientId, now) => {
    const config = await weekly.repository.getConfig(owner, clientId)
    const binding = await weekly.repository.getBinding(owner, clientId)
    const scope = config ? await weekly.repository.getTargetPolicy(owner, clientId, config.publicationTargetId, config.policyId) : null
    if (!config || config.status !== 'active' || config.cadenceDays !== 7 || binding?.status !== 'active'
      || !scope?.target.executionEnabled || scope.target.status !== 'active' || scope.policy?.status !== 'enabled'
      || scope.policy.revokedAt !== null || scope.policy.expiresAt <= now) throw new Error('weekly workflow is not active')
  }

  const planner = { withClientLock: async <T>(_owner: number, _client: number, work: (config: typeof weekly.state.config, repository: typeof operations.repository) => Promise<T>) => work(weekly.state.config, operations.repository) }
  const calendar = await createInitialWeeklyCalendar(OWNER, client.id, { productionPlanId: bundle.plan.id,
    startDate: '2026-10-04', publishLocalTime: '09:00', monthlyArticleLimit: 1 }, WEEKLY_NOW, planner)
  const entry = operations.entries.find(row => row.calendarId === calendar.calendar.id)!

  vi.mocked(weekly.repository.lockJob).mockImplementation(async (owner, jobId) => {
    const lineage = await operations.repository.resolveWorkspaceEntry(owner, entry.id)
    if (!lineage?.job || lineage.job.id !== jobId) throw new Error('job scope mismatch')
  })
  vi.mocked(weekly.repository.getDraft).mockImplementation(async (owner, clientId, entryId, now = WEEKLY_NOW): Promise<WeeklyDraft | null> => {
    const lineage = await operations.repository.resolveWorkspaceEntry(owner, entryId)
    if (!lineage?.job || !lineage.draft || !lineage.riskGate || lineage.client.id !== clientId) return null
    const currentTarget = await operations.repository.findPublicationTarget(owner, target.id)
    const currentPolicy = await operations.repository.findAutopilotPolicy(owner, clientId, target.id)
    const authorization = await operations.repository.findMachineAuthorizationForTarget(owner, entryId, target.id)
    return { client: lineage.client, entryId, entryStatus: lineage.entry.status, jobId: lineage.job.id, draftId: lineage.draft.id,
      draftVersion: lineage.draft.version, contentType: lineage.entry.contentType, language: lineage.entry.language,
      title: String(lineage.draft.title), body: String(lineage.draft.body), contentHash: lineage.draft.contentHash,
      evidenceSnapshotHash: lineage.entry.evidenceSnapshotHash, riskGateStatus: lineage.riskGate.status,
      machineAuthorizationValid: Boolean(authorization?.status === 'authorized' && authorization.revokedAt === null
        && authorization.authorizationExpiresAt && authorization.authorizationExpiresAt > now),
      target: currentTarget!, policy: currentPolicy }
  })
  operations.repository.assertWeeklyCustomerConsent = async input => {
    const [config, binding, draft, request] = await Promise.all([
      weekly.repository.getConfig(input.ownerUserId, input.clientId), weekly.repository.getBinding(input.ownerUserId, input.clientId),
      weekly.repository.getDraft(input.ownerUserId, input.clientId, input.entryId, input.startedAt),
      weekly.repository.findLatestRequestForEntry(input.ownerUserId, input.clientId, input.entryId),
    ])
    const consent = request ? await weekly.repository.latestConsent(request.id) : null
    if (!config || !binding || !draft || !request || !weeklyConsentAllowsPublication(request, consent, config, binding, draft, input.startedAt)
      || request.jobId !== input.jobId || request.draftId !== input.draftId || request.contentHash !== input.contentHash
      || request.evidenceSnapshotHash !== input.evidenceSnapshotHash || request.publicationTargetId !== input.targetId) {
      throw new Error('weekly publication consent is not current')
    }
  }
  const reservePublicationAttempt = operations.repository.reservePublicationAttempt.bind(operations.repository)
  operations.repository.reservePublicationAttempt = async input => {
    const [config, binding, draft, request, machineAuthorization] = await Promise.all([
      weekly.repository.getConfig(input.ownerUserId, input.clientId), weekly.repository.getBinding(input.ownerUserId, input.clientId),
      weekly.repository.getDraft(input.ownerUserId, input.clientId, input.entryId, input.startedAt),
      weekly.repository.findLatestRequestForEntry(input.ownerUserId, input.clientId, input.entryId),
      operations.repository.findMachineAuthorization(input.ownerUserId, input.entryId, input.authorityReference || ''),
    ])
    const consent = request ? await weekly.repository.latestConsent(request.id) : null
    if (!config || !binding || !draft || !request || !weeklyConsentAllowsPublication(request, consent, config, binding, draft, input.startedAt)
      || request.jobId !== input.jobId || request.draftId !== input.draftId || request.contentHash !== input.contentHash
      || request.evidenceSnapshotHash !== input.evidenceSnapshotHash || request.publicationTargetId !== input.targetId
      || machineAuthorization?.status !== 'executing' || machineAuthorization.authorizationFingerprint !== input.authorityReference) {
      throw new Error('weekly publication consent is not current')
    }
    return reservePublicationAttempt(input)
  }

  const provider = providerRuntime(operations)
  const ingestTransport: FirstPartyFetch = vi.fn(async (url, init) => {
    expect(url).toBe(`${target.targetOrigin}/api/first-party/content-ingest`)
    const request = JSON.parse(init.body!) as { publicationId: string; contentHash: string }
    return { status: 202, text: async () => JSON.stringify({ status: 'draft_received', published: false,
      receiptScope: 'draft_ingest_outcome', receiptIsCurrentState: false, publicationId: request.publicationId,
      contentHash: request.contentHash, postId: '9b131e17-a5c2-45e1-a40f-44b6084de9b1', postVersion: 1, replayed: false }) }
  })
  let ingestNonce = 0
  const runtime = { productionRuntime: provider.productionRuntime, fetchImpl: ingestTransport,
    serverCredentialResolver: vi.fn(async () => ({ ok: true as const, value: SITE_SECRET })),
    nonceProvider: () => `same-lineage-ingest-${++ingestNonce}` }
  const runtimeDeps: WeeklyRuntimeDependencies = { weekly: weeklyDeps, operations: operations.repository,
    roll: (owner, clientId, now) => rollApprovedWeeklyCalendar(owner, clientId, now, planner),
    workflow: runOwnerContentEntryWorkflow, publish: executeContentOperationEntry, send: runWeeklyLineOutbox,
    runtime: runtime as WeeklyRuntimeDependencies['runtime'] }
  return { operations, client, target, policy, weekly, calendar: calendar.calendar, entry, provider, ingestTransport, runtimeDeps }
}

describe('signed LINE weekly draft to owner-confirmed measurement (isolated same-lineage integration)', () => {
  it('keeps one server-owned lineage through receipt, signed site status and observational measurement without granting learning', async () => {
    const f = await setupLineage()
    const tickOptions = { featureEnabled: true, schedulerEnabled: true, configurationReady: true, getDependencies: () => f.runtimeDeps }
    const prepared = await runWeeklyContentTick({ ownerUserId: OWNER, clientId: CLIENT, now: WEEKLY_NOW }, tickOptions)
    expect(prepared.clients).toContainEqual({ clientId: CLIENT, status: 'awaiting_customer' })
    expect(prepared.reviewQueued).toBe(1)
    expect(f.provider.qwenFetch).toHaveBeenCalledTimes(1)
    expect(f.provider.autoGeoTransport).toHaveBeenCalledTimes(1)
    expect(f.ingestTransport).not.toHaveBeenCalled()
    const request = f.weekly.state.requests[0]!
    const generated = f.operations.generated.get(f.entry.id)!
    const draft = generated.draft as { id: number; jobId: number; version: number; contentHash: string }
    expect(request).toMatchObject({ entryId: f.entry.id, jobId: draft.jobId, draftId: draft.id, draftVersion: draft.version,
      contentHash: draft.contentHash, publicationTargetId: f.target.id, status: 'pending' })

    const actionToken = deriveReviewTokens(request, WEEKLY_KEY).actionToken
    const approvalEvent = { type: 'postback', mode: 'active', timestamp: WEEKLY_NOW.getTime(), source: { type: 'user', userId: LINE_USER },
      webhookEventId: '01FZ74A0TDDPYRVKNK77XKC3ZS', postback: { data: encodeWeeklyLinePostback(request.requestId, actionToken, 'approved') } }
    expect(await processWeeklyLineWebhook({ ...lineWebhookOptions(f.weekly), ...signedLine([approvalEvent]) })).toMatchObject({ status: 'accepted', processed: 1 })
    expect(f.ingestTransport).not.toHaveBeenCalled()

    const published = await runWeeklyContentTick({ ownerUserId: OWNER, clientId: CLIENT, now: WEEKLY_NOW }, tickOptions)
    expect(published.clients).toContainEqual({ clientId: CLIENT, status: 'draft_received' })
    expect(published.publicationAttempted).toBe(1)
    expect(f.ingestTransport).toHaveBeenCalledTimes(1)
    expect(f.provider.qwenFetch).toHaveBeenCalledTimes(1)
    expect(f.operations.reviews.size).toBe(0)
    const attempt = f.operations.attempts[0]!
    const authorization = f.operations.machineAuthorizations[0]!
    expect(attempt).toMatchObject({ entryId: f.entry.id, targetId: f.target.id, contentHash: request.contentHash,
      status: 'draft_received', authorityReference: authorization.authorizationFingerprint })
    expect(authorization.status).toBe('draft_received')
    expect(f.entry).toMatchObject({ status: 'awaiting_site_review', publicationAuthorityReference: authorization.authorizationFingerprint })

    let statusNonce = 0
    const statusTransport: FirstPartyFetch = vi.fn(async (url, init) => {
      expect(url).toBe(`${f.target.targetOrigin}/api/first-party/publication-status`)
      const requestBody = JSON.parse(init.body!) as { version: string; targetId: string; publicationId: string; contentHash: string; postId: string; timestamp: string; nonce: string }
      const observation = { version: requestBody.version, targetId: requestBody.targetId, targetOrigin: f.target.targetOrigin,
        publicationId: requestBody.publicationId, contentHash: requestBody.contentHash, postId: requestBody.postId,
        receiptScope: 'site_publication_observation', receiptIsCurrentState: false, state: 'published', postVersion: 2,
        publishedVersion: 2, receivedDocumentHash: DOCUMENT_HASH, publishedDocumentHash: DOCUMENT_HASH, hasUnpublishedChanges: false,
        publishedAt: new Date(WEEKLY_NOW.getTime() + 30_000).toISOString(), observedAt: requestBody.timestamp, nonce: requestBody.nonce }
      const response = JSON.stringify(observation)
      const signature = createHmac('sha256', SITE_SECRET).update([requestBody.version, 'response', 'POST',
        '/api/first-party/publication-status', f.target.targetOrigin, sha(init.body!), sha(response), requestBody.timestamp, requestBody.nonce].join('\n')).digest('hex')
      return { status: 200, headers: { 'x-ds-status-signature': signature }, text: async () => response }
    })
    const siteDependencies = { fetchImpl: statusTransport, serverCredentialResolver: vi.fn(async () => ({ ok: true as const, value: SITE_SECRET })),
      nonceProvider: () => `same-lineage-status-${++statusNonce}`, now: SITE_NOW }
    const observed = await checkOwnerSitePublication({ ownerUserId: OWNER, entryId: f.entry.id,
      value: { targetRowId: f.target.id, idempotencyKey: 'same-lineage-site-check' }, repository: f.operations.repository, dependencies: siteDependencies })
    expect(observed).toMatchObject({ status: 'verified', workflowChanged: false, learningAuthorized: false,
      observation: { state: 'published', contentMatch: 'matched' } })
    const measurementOptions = { repository: f.operations.repository, weeklyRepository: f.weekly.repository, dependencies: siteDependencies, now: SITE_NOW }
    const offer = await projectSiteMeasurement(OWNER, f.entry.id, f.target.id, measurementOptions)
    expect(offer).toMatchObject({ state: 'available', reason: 'available' })
    expect(await resolveConfirmedSiteMeasurementLineages(OWNER, f.entry.id, { ...measurementOptions, fresh: false })).toEqual([])
    await expect(confirmOwnerSiteMeasurement({ ownerUserId: OWNER, entryId: f.entry.id, ...measurementOptions,
      value: { targetRowId: f.target.id, expectedPublicationFingerprint: offer.publicationFingerprint!, confirmed: true,
        idempotencyKey: 'same-lineage-confirm', authorityReference: authorization.authorizationFingerprint } })).rejects.toMatchObject({ statusCode: 422 })
    const confirmation = await confirmOwnerSiteMeasurement({ ownerUserId: OWNER, entryId: f.entry.id, ...measurementOptions,
      value: { targetRowId: f.target.id, expectedPublicationFingerprint: offer.publicationFingerprint!, confirmed: true,
        idempotencyKey: 'same-lineage-confirm' } })
    expect(confirmation).toMatchObject({ status: 'confirmed', workflowChanged: false, learningAuthorized: false, receiptIsCurrentAuthority: false })
    const [lineage] = await resolveConfirmedSiteMeasurementLineages(OWNER, f.entry.id, { ...measurementOptions, fresh: false })
    expect(lineage).toMatchObject({ ownerUserId: OWNER, clientId: CLIENT, entryId: f.entry.id, targetId: f.target.id,
      jobId: draft.jobId, draftId: draft.id, draftVersion: draft.version, contentHash: draft.contentHash,
      evidenceKind: 'site_publication_confirmation' })

    const measured = measurementRepository(f.client, f.target, lineage!.canonicalPage)
    const googleFetcher = vi.fn(async () => new Response(JSON.stringify({ rows: [{ keys: [lineage!.canonicalPage], clicks: 10, impressions: 100, position: 4 }] }), { status: 200 }))
    const measurementDependencies = { repository: measured.repository, contentOperations: f.operations.repository, now: MEASUREMENT_NOW,
      resolveSiteMeasurementLineages: (ownerUserId: number, entryId: number, options: { fresh: boolean; repository?: typeof f.operations.repository }) =>
        resolveConfirmedSiteMeasurementLineages(ownerUserId, entryId, { repository: options.repository ?? f.operations.repository,
          weeklyRepository: f.weekly.repository, dependencies: { ...siteDependencies, now: MEASUREMENT_NOW }, now: MEASUREMENT_NOW, fresh: options.fresh }),
      googleCredentialResolver: vi.fn(async () => ({ accessToken: 'synthetic-token', expiresAt: '2099-01-01T00:00:00.000Z',
        grantedScopes: ['https://www.googleapis.com/auth/webmasters.readonly'] })), fetcher: googleFetcher }
    const scheduled = await scheduleMeasurementForEntry(OWNER, f.entry.id, measurementDependencies)
    expect(scheduled.scheduled).toBe(5)
    expect(scheduled.runs.every(run => run.entryId === request.entryId && run.contentHash === request.contentHash)).toBe(true)
    const result = await processMeasurementRun(OWNER, scheduled.runs[0]!.id, measurementDependencies)
    expect(result.run.state).toBe('succeeded')
    expect(result.assessment).toMatchObject({ evidenceKind: 'site_publication_confirmation', learningCandidate: null })
    expect(f.operations.outcomes[0]).toMatchObject({ entryId: request.entryId, contentHash: request.contentHash,
      assessmentSnapshot: { evidenceKind: 'site_publication_confirmation', learningCandidate: false } })
    const dataset = await buildOwnerContentLearningDataset(OWNER, f.operations.repository)
    expect(JSON.stringify(dataset)).not.toContain(f.operations.outcomes[0]!.publicationReceiptFingerprint!)

    const expectAuthorityInvalid = async () => expect(
      await projectSiteMeasurement(OWNER, f.entry.id, f.target.id, measurementOptions),
    ).toMatchObject({ state: 'blocked', reason: 'authority_invalid' })

    const policyStatus = f.policy.status
    f.policy.status = 'revoked'
    await expectAuthorityInvalid()
    f.policy.status = policyStatus
    const policyExpiry = f.policy.expiresAt
    f.policy.expiresAt = SITE_NOW
    await expectAuthorityInvalid()
    f.policy.expiresAt = policyExpiry

    const targetConfigurationFingerprint = f.target.configurationFingerprint
    f.target.configurationFingerprint = 'd'.repeat(64)
    await expectAuthorityInvalid()
    f.target.configurationFingerprint = targetConfigurationFingerprint

    const requestHash = request.contentHash
    request.contentHash = 'f'.repeat(64)
    await expectAuthorityInvalid()
    request.contentHash = requestHash

    const requestStatus = request.status
    request.status = 'revoked'
    await expectAuthorityInvalid()
    request.status = requestStatus
    const requestExpiry = request.expiresAt
    request.expiresAt = attempt.startedAt
    await expectAuthorityInvalid()
    request.expiresAt = requestExpiry

    const binding = f.weekly.state.binding!
    binding.status = 'revoked'
    await expectAuthorityInvalid()
    binding.status = 'active'

    const profile = f.operations.entityStrategyProfiles[0]!
    profile.status = 'revoked'
    await expectAuthorityInvalid()
    profile.status = 'active'

    const query = f.operations.queryOwnership[0]!
    query.status = 'revoked'
    await expectAuthorityInvalid()
    query.status = 'active'

    authorization.revokedAt = SITE_NOW
    await expectAuthorityInvalid()
  })
})
