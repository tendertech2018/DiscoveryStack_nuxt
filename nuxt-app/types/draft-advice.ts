export interface DraftAdviceContext {
  fingerprint: string
  engine: string
  model: string
  modelVersion: string | null
  interface: string
  locale: string
  region: string | null
  memberCount: number
}

export interface DraftReviewSuggestion {
  id: 'headings' | 'citations' | 'missing_evidence'
  priority: 'check_first' | 'review'
  basis: 'draft_structure' | 'missing_data'
  title: string
  explanation: string
}

interface AdviceIdentity {
  contractVersion: 'exact-draft-model-advice-v2'
  entryId: number
  draftId: number
  draftVersion: number
  contentHash: string
  modelArtifactHash: string
  datasetManifestHash: string
  predictionIsVerifiedOutcome: false
  publicationAuthorization: false
  productionModelActivation: false
  crossDraftRankingAllowed: false
}

export interface DraftAdviceContextRequired extends AdviceIdentity {
  status: 'context_required'
  contexts: DraftAdviceContext[]
}

export interface DraftAdviceReady extends AdviceIdentity {
  status: 'ready'
  experimentalScore: number
  representedContext: DraftAdviceContext
  contextSource: 'owner_selected_dataset_context' | 'only_language_compatible_dataset_context'
  contextIsObservedForDraft: false
  featureContributions: Array<{ key: string; contribution: number; missing: boolean }>
  missingFeatureList: string[]
  reviewSuggestions: DraftReviewSuggestion[]
  limitations: string[]
  adviceFingerprint: string
}

export type DraftAdviceResponse = DraftAdviceContextRequired | DraftAdviceReady
