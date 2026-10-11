import { z } from 'zod'
import type { DraftAdviceResponse } from '../types/draft-advice'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const text = z.string().min(1).max(300)
const context = z.object({ fingerprint: hash, engine: text, model: text, modelVersion: text.nullable(), interface: text, locale: text, region: text.nullable(), memberCount: z.number().int().positive() }).strict()
const identity = {
  contractVersion: z.literal('exact-draft-model-advice-v2'), entryId: z.number().int().positive(), draftId: z.number().int().positive(), draftVersion: z.number().int().positive(), contentHash: hash, modelArtifactHash: hash, datasetManifestHash: hash,
  predictionIsVerifiedOutcome: z.literal(false), publicationAuthorization: z.literal(false), productionModelActivation: z.literal(false), crossDraftRankingAllowed: z.literal(false),
}
const response = z.discriminatedUnion('status', [
  z.object({ ...identity, status: z.literal('context_required'), contexts: z.array(context).min(2).max(100) }).strict(),
  z.object({ ...identity, status: z.literal('ready'), experimentalScore: z.number().finite().min(0).max(1), representedContext: context, contextSource: z.enum(['owner_selected_dataset_context', 'only_language_compatible_dataset_context']), contextIsObservedForDraft: z.literal(false), featureContributions: z.array(z.object({ key: text, contribution: z.number().finite(), missing: z.literal(false) }).strict()).max(8), missingFeatureList: z.array(text).max(256), reviewSuggestions: z.array(z.object({ id: z.enum(['headings', 'citations', 'missing_evidence']), priority: z.enum(['check_first', 'review']), basis: z.enum(['draft_structure', 'missing_data']), title: text, explanation: z.string().min(1).max(1000) }).strict()).max(3), limitations: z.array(text).max(100), adviceFingerprint: hash }).strict(),
])

export function parseDraftAdviceResponse(value: unknown): DraftAdviceResponse | null {
  const parsed = response.safeParse(value)
  return parsed.success ? parsed.data : null
}

const explanations: Record<string, string> = {
  EXACT_DRAFT_REQUIRED: '找不到你有權查看的完整草稿，或草稿內容與版本不一致。',
  CURRENT_LEARNING_CONSENT_REQUIRED: '這份草稿目前沒有符合既有規則的學習用途授權；不會因查看建議而自動取得授權。',
  OWNER_SHADOW_MODEL_REQUIRED: '需要有效、完整且已核准的影子模型；現在不會以示範模型代替。',
  CURRENT_MODEL_LINEAGE_REQUIRED: '模型資料集或來源授權已失效，請先完成資料審核。',
  ADVICE_LINEAGE_CHANGED: '計算期間草稿、模型或授權已改變，這次結果已捨棄。',
  ADVICE_LANGUAGE_NOT_REPRESENTED: '模型資料沒有這份草稿的語言，不會借用其他語言給分。',
  ADVICE_CONTEXT_CHANGED: '選定的模型情境已改變，請重新載入可用情境。',
  ADVICE_CONTEXT_SCOPE_TOO_BROAD: '模型情境太多，請先縮小模型資料範圍。',
  INVALID_DRAFT_ADVICE_INPUT: '請選擇有效的草稿、模型與評估情境。',
}

export function draftAdviceErrorMessage(error: unknown): string {
  const failure = error as { statusCode?: unknown; status?: unknown; data?: { data?: { code?: unknown } } } | null
  if (failure?.statusCode === 401 || failure?.status === 401) return '請先登入 Owner 工作台。'
  const code = failure?.data?.data?.code
  return typeof code === 'string' && Object.hasOwn(explanations, code) ? explanations[code]! : '目前無法取得可信的建議。請核對服務狀態；沒有修改文章、發布或訓練。'
}
