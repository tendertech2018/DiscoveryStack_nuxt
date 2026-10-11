import { z } from 'zod'
import { createContentOperationsRepository, type ContentOperationsRepository } from '../content-operations/repository'
import { fingerprint } from '../geo-outcome-model/canonical'
import { getProductionGeoOutcomeRepository, predict, resolveApprovedFallbackForArtifact } from '../geo-outcome-model/service'
import { canBePrimaryCitationTruth } from '../geo-outcome-model/observation-contract'
import { verifyArtifactHash } from '../geo-outcome-model/release-gate'
import { isFallbackOnlyArtifact } from '../geo-outcome-model/artifact'
import { approvalReference, assertDatasetKnowledgeAuthorityCurrent } from '../geo-outcome-model/knowledge-authority'
import type { ContentFeatureInput, GeoOutcomeRepositoryPort } from '../geo-outcome-model/types'
import { contentFingerprint } from '../seo-geo-core/riskGate'
import { DrizzleLearningLoopRepository } from './repository'
import { learningError, resolveLearningAuthority } from './authority'
import type { LearningLoopRepository } from './types'
import type { DraftAdviceContext, DraftAdviceResponse, DraftReviewSuggestion } from '../../types/draft-advice'

const schema = z.object({ entryId: z.number().int().positive(), artifactId: z.string().regex(/^geo-model-[a-f0-9]{20,64}$/), contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict()
export type DraftAdviceDependencies = { operations?: ContentOperationsRepository; learning?: LearningLoopRepository; models?: GeoOutcomeRepositoryPort; now?: Date | (() => Date) }
const draftIdentity = (lineage: NonNullable<Awaited<ReturnType<ContentOperationsRepository['resolveWorkspaceEntry']>>>) => fingerprint({ entryId: lineage.entry.id, ownerUserId: lineage.entry.ownerUserId, clientId: lineage.client.id, origin: lineage.client.canonicalSiteOrigin, draftId: lineage.draft?.id, draftVersion: lineage.draft?.version, contentHash: lineage.entry.contentHash, evidenceSnapshotHash: lineage.entry.evidenceSnapshotHash, contentType: lineage.entry.contentType, language: lineage.entry.language, opportunityKey: lineage.deliverable.opportunityKey })

/** Evaluate a server-read exact draft. Scores never replace quality review or customer approval. */
export async function getDraftLearningAdvice(ownerUserId: number, value: unknown, deps: DraftAdviceDependencies = {}): Promise<DraftAdviceResponse> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) learningError('INVALID_DRAFT_ADVICE_INPUT', '請選擇草稿和已通過影子驗證的模型。', 422)
  const readNow = () => typeof deps.now === 'function' ? deps.now() : deps.now || new Date()
  const operations = deps.operations || createContentOperationsRepository(), learning = deps.learning || new DrizzleLearningLoopRepository(), models = deps.models || getProductionGeoOutcomeRepository(), now = readNow()
  const lineage = await operations.resolveWorkspaceEntry(ownerUserId, parsed.data.entryId)
  if (!lineage || lineage.client.ownerUserId !== ownerUserId || lineage.entry.ownerUserId !== ownerUserId || !lineage.draft || typeof lineage.draft.title !== 'string' || typeof lineage.draft.body !== 'string' || lineage.draft.contentHash !== lineage.entry.contentHash || contentFingerprint(lineage.draft.title, lineage.draft.body) !== lineage.draft.contentHash) learningError('EXACT_DRAFT_REQUIRED')
  const exactDraftIdentity = draftIdentity(lineage)
  let grantedScope: { id: number; authorizationFingerprint: string; sourceFingerprint: string } | null = null
  for (const grant of (await learning.listAuthorizations(ownerUserId)).filter(row => row.clientId === lineage.client.id)) {
    const current = resolveLearningAuthority(await learning.getScope(ownerUserId, grant.id), { ownerUserId, clientId: grant.clientId, sourceId: grant.sourceId }, now)
    if (current) { grantedScope = { id: grant.id, authorizationFingerprint: grant.authorizationFingerprint, sourceFingerprint: current.sourceFingerprint }; break }
  }
  if (!grantedScope) learningError('CURRENT_LEARNING_CONSENT_REQUIRED')
  const artifact = await models.getArtifact(ownerUserId, parsed.data.artifactId)
  if (!artifact || isFallbackOnlyArtifact(artifact) || artifact.status !== 'approved_for_shadow' || artifact.taskType !== 'citation_selection' || !verifyArtifactHash(artifact)) learningError('OWNER_SHADOW_MODEL_REQUIRED')
  const dataset = (await models.listDatasets(ownerUserId)).find(row => row.manifestFingerprint === artifact.datasetManifestFingerprint)
  const decision = (await models.listDatasetDecisions(ownerUserId)).filter(row => row.manifestFingerprint === dataset?.manifestFingerprint && row.manifestId === dataset?.manifestId).at(-1)
  const members = dataset ? await models.getDatasetMembers(ownerUserId, dataset.manifestId) : []
  if (!dataset || dataset.status !== 'approved' || decision?.newStatus !== 'approved' || !members.length || members.some(row => !canBePrimaryCitationTruth(row.observation))) learningError('CURRENT_MODEL_LINEAGE_REQUIRED')
  let modelKnowledgeReference
  try { modelKnowledgeReference = (await assertDatasetKnowledgeAuthorityCurrent(ownerUserId, dataset, models, approvalReference(artifact))).reference } catch { learningError('CURRENT_MODEL_LINEAGE_REQUIRED') }
  // Never borrow a different language or silently pick the first engine in a dataset.
  // These are hypothetical evaluation contexts, not observations of this draft.
  const contexts = new Map<string, DraftAdviceContext>()
  for (const { observation: row } of members) {
    if (row.locale.toLowerCase() !== lineage.entry.language.toLowerCase()) continue
    const projected = { engine: row.engine, model: row.model, modelVersion: row.modelVersion, interface: row.interface, locale: row.locale, region: row.region }
    const key = fingerprint({ datasetManifestHash: dataset.manifestFingerprint, ...projected })
    const previous = contexts.get(key)
    contexts.set(key, { ...projected, fingerprint: key, memberCount: (previous?.memberCount || 0) + 1 })
  }
  if (!contexts.size) learningError('ADVICE_LANGUAGE_NOT_REPRESENTED', '模型資料沒有這份草稿的語言，不能借用其他語言評分。')
  if (contexts.size > 100) learningError('ADVICE_CONTEXT_SCOPE_TOO_BROAD', '模型包含過多評估情境，請先縮小模型資料範圍。')
  const selected = parsed.data.contextFingerprint ? contexts.get(parsed.data.contextFingerprint) : contexts.size === 1 ? [...contexts.values()][0] : undefined
  if (parsed.data.contextFingerprint && !selected) learningError('ADVICE_CONTEXT_CHANGED', '所選評估情境已失效，請重新核對。')
  const draft = lineage.draft, body = draft.body as string
  const identity = { contractVersion: 'exact-draft-model-advice-v2' as const, entryId: lineage.entry.id, draftId: draft.id, draftVersion: draft.version, contentHash: draft.contentHash, modelArtifactHash: artifact.artifactHash, datasetManifestHash: dataset.manifestFingerprint, predictionIsVerifiedOutcome: false as const, publicationAuthorization: false as const, productionModelActivation: false as const, crossDraftRankingAllowed: false as const }
  const assertCurrent = async () => {
    const [fresh, freshArtifact, freshDataset, freshDecisions, freshMembers, freshGrant] = await Promise.all([
      operations.resolveWorkspaceEntry(ownerUserId, lineage.entry.id), models.getArtifact(ownerUserId, artifact.artifactId), models.getDataset(ownerUserId, dataset.manifestId), models.listDatasetDecisions(ownerUserId), models.getDatasetMembers(ownerUserId, dataset.manifestId), learning.getScope(ownerUserId, grantedScope.id),
    ])
    const freshDecision = freshDecisions.filter(row => row.manifestFingerprint === dataset.manifestFingerprint && row.manifestId === dataset.manifestId).at(-1)
    const freshAuthority = freshGrant ? resolveLearningAuthority(freshGrant, { ownerUserId, clientId: lineage.client.id, sourceId: freshGrant.authorization.sourceId }, readNow()) : null
    if (!fresh || draftIdentity(fresh) !== exactDraftIdentity || fresh.draft?.id !== draft.id || fresh.draft.contentHash !== draft.contentHash || fresh.entry.contentHash !== draft.contentHash || typeof fresh.draft.title !== 'string' || typeof fresh.draft.body !== 'string' || contentFingerprint(fresh.draft.title, fresh.draft.body) !== draft.contentHash || freshArtifact?.artifactHash !== artifact.artifactHash || freshArtifact.status !== 'approved_for_shadow' || !verifyArtifactHash(freshArtifact) || freshGrant?.authorization.authorizationFingerprint !== grantedScope.authorizationFingerprint || freshAuthority?.sourceFingerprint !== grantedScope.sourceFingerprint || freshDataset?.status !== 'approved' || freshDataset.manifestFingerprint !== dataset.manifestFingerprint || freshDecision?.newStatus !== 'approved' || fingerprint(freshMembers) !== fingerprint(members) || freshMembers.some(row => !canBePrimaryCitationTruth(row.observation))) learningError('ADVICE_LINEAGE_CHANGED')
    try { await assertDatasetKnowledgeAuthorityCurrent(ownerUserId, freshDataset, models, modelKnowledgeReference) } catch { learningError('ADVICE_LINEAGE_CHANGED') }
    if (!await resolveApprovedFallbackForArtifact(ownerUserId, freshArtifact, models)) learningError('ADVICE_LINEAGE_CHANGED')
  }
  if (!selected) {
    await assertCurrent()
    return { ...identity, status: 'context_required', contexts: [...contexts.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)) }
  }
  const context = members.find(row => row.observation.locale.toLowerCase() === lineage.entry.language.toLowerCase() && row.observation.engine === selected.engine && row.observation.model === selected.model && row.observation.modelVersion === selected.modelVersion && row.observation.interface === selected.interface && row.observation.locale === selected.locale && row.observation.region === selected.region)!.observation
  const headings = [...body.matchAll(/^#{1,6}\s+/gm)].map(match => match[0].trim().length)
  const features: ContentFeatureInput = {
    contentType: lineage.entry.contentType === 'article' || lineage.entry.contentType === 'faq' ? lineage.entry.contentType : 'other',
    locale: lineage.entry.language, pageAgeBucket: 'unknown', contentLengthBucket: body.length < 500 ? 'xs' : body.length < 2000 ? 's' : body.length < 6000 ? 'm' : body.length < 12000 ? 'l' : 'xl',
    headingHierarchy: !headings.length ? 'none' : new Set(headings).size > 1 ? 'structured' : 'flat', directAnswerPresence: 'unknown', faqStructure: 'unknown', structuredDataPresence: 'unknown', citationMarkerCount: Math.min(1000, [...body.matchAll(/\[cite:[^\]]+\]/g)].length), approvedAuthoritySourceCount: null, evidenceUtilizationRatio: null, entityCoverage: null,
    selectedAutoGeoRuleHashes: [], appliedAutoGeoRuleHashes: [], canonicalFlag: 'unknown', indexabilityFlag: 'unknown', internalLinkDepthBucket: 'unknown', contentFreshnessBucket: 'unknown', queryPageLexicalOverlap: null, topicClusterEqual: 'unknown', verifiedPublicationAgeDays: null, priorObservationCount: null,
  }
  const timestamp = now.toISOString(), runIdentity = `draft-advice:${fingerprint({ entryId: lineage.entry.id, draftId: draft.id, contentHash: draft.contentHash }).slice(0, 24)}`
  const input = { schemaVersion: 'geo-outcome-observation-v1', projectId: null, clientId: null, websiteIdentityHash: fingerprint(lineage.client.canonicalSiteOrigin), queryIdentityHash: fingerprint(lineage.deliverable.opportunityKey), normalizedQueryHash: fingerprint(lineage.deliverable.opportunityKey), candidatePageIdentityHash: fingerprint({ entryId: lineage.entry.id, contentHash: draft.contentHash }), canonicalPageHash: fingerprint({ entryId: lineage.entry.id }), contentHash: draft.contentHash, evidenceSnapshotHash: lineage.entry.evidenceSnapshotHash, publicationReceiptFingerprint: null,
    engine: context.engine, model: context.model, modelVersion: context.modelVersion, interface: context.interface, locale: lineage.entry.language, region: context.region, runIdentity, runTimestamp: timestamp, observationWindow: { start: timestamp, end: timestamp }, observableStatus: 'not_observable', retrievalStatus: 'unknown', citationStatus: 'unknown', citationPosition: null, mentionStatus: 'unknown', recommendationStatus: 'unknown', labelBasis: 'heuristic_auxiliary_only', verificationStatus: 'unverified', evidenceLocatorHashes: [], appliedRuleHashes: [], contentFeatureVector: features }
  let prediction: Awaited<ReturnType<typeof predict>>
  try { prediction = await predict(ownerUserId, artifact.artifactId, input, models) }
  catch { learningError('ADVICE_LINEAGE_CHANGED', '模型、回退基準或資料授權已變動，請更新後重新核對。') }
  // A revocation or draft edit while scoring prevents even an advisory from being accepted as current.
  await assertCurrent()
  const reviewSuggestions: DraftReviewSuggestion[] = []
  if (!headings.length || new Set(headings).size < 2) reviewSuggestions.push({ id: 'headings', priority: 'review', basis: 'draft_structure', title: '檢查文章層次是否清楚', explanation: '目前沒有多層次 Markdown 標題；可以人工核對是否需要分段。這是結構檢查，不是模型證明加標題能改善排名。' })
  if (!features.citationMarkerCount) reviewSuggestions.push({ id: 'citations', priority: 'check_first', basis: 'draft_structure', title: '先核對主張的引用依據', explanation: '草稿沒有系統可辨識的引用標記。請核對來源，不要自動補上不存在的證據。' })
  if (prediction.missingFeatureList.length) reviewSuggestions.push({ id: 'missing_evidence', priority: 'check_first', basis: 'missing_data', title: '先補齊未知資訊，再解讀模型分數', explanation: '來源品質、發布狀態或其他特徵仍有未知值；系統沒有自行推測，也不能據此排出跨文章優先順序。' })
  const advice = { ...identity, status: 'ready' as const, experimentalScore: prediction.experimentalScore, representedContext: selected, contextSource: parsed.data.contextFingerprint ? 'owner_selected_dataset_context' as const : 'only_language_compatible_dataset_context' as const, contextIsObservedForDraft: false as const, featureContributions: prediction.featureContributions.filter(row => !row.missing && !prediction.missingFeatureList.includes(row.key)).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 8), missingFeatureList: prediction.missingFeatureList, reviewSuggestions: reviewSuggestions.sort((a, b) => Number(b.priority === 'check_first') - Number(a.priority === 'check_first')), limitations: [...prediction.limitations, 'single_draft_advisory_not_a_market_ranking', 'unknown_features_not_inferred', 'does_not_edit_or_publish_content', 'exact_customer_approval_remains_required', 'context_is_hypothetical_not_observed_for_draft', 'review_suggestions_are_not_causal_model_recommendations'] }
  return { ...advice, adviceFingerprint: fingerprint(advice) }
}
