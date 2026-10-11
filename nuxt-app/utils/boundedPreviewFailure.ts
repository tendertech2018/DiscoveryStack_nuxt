import type { BoundedQwenPreviewErrorCode } from '../server/geo/bounded-preview'

const explanations = Object.freeze({
  CONFIGURATION: 'AI 服務設定未通過檢查。',
  ALREADY_USED: '本次測試已使用，系統拒絕再次執行。',
  REQUEST_TOO_LARGE: '完整請求超過單次測試的大小上限。',
  TIMEOUT: '等待 AI 回應逾時，無法確認供應商是否已完成處理。',
  TRANSPORT: '連線未正常完成，無法確認供應商是否已收到請求。',
  UNAUTHORIZED: 'AI 供應商拒絕存取，需核對服務端憑證或權限。',
  RATE_LIMITED: 'AI 供應商回報使用限制，需先核對供應商用量與限制。',
  UPSTREAM: 'AI 供應商回報失敗，沒有可接受的草稿。',
  RESPONSE_TOO_LARGE: 'AI 回應超過安全大小上限，已停止接收。',
  MALFORMED_RESPONSE: 'AI 回應格式未通過檢查。',
  MODEL_MISMATCH: 'AI 回報的模型與本次允許的模型不符。',
  TRUNCATED_RESPONSE: 'AI 回應未完整結束，不能當作完成的草稿。',
  USAGE_INVALID: 'AI 用量回報缺漏或無效，無法可靠估算費用。',
  BUDGET_EXCEEDED: 'AI 用量回報超出本次預算檢查，結果未被接受。',
  THINKING_NOT_DISABLED: 'AI 回應未符合關閉思考模式的限制。',
  UNSAFE_OUTPUT: 'AI 草稿未通過來源與內容安全檢查，未被採用。',
  UNKNOWN: '目前沒有足夠的安全診斷資訊，無法判定原因。',
} satisfies Record<BoundedQwenPreviewErrorCode, string>)

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Only fixed copy and allowlisted codes reach the page; never echo raw errors. */
export function boundedPreviewFailureMessage(error: unknown): string {
  const failure = record(error)
  const payload = record(failure?.data)
  const status = failure?.status ?? failure?.statusCode ?? payload?.statusCode
  if (status === 401) return '需要 owner 工作階段。請先從私有稽核實驗室登入；本頁不會自動重送。'
  // ofetch error.data is the HTTP JSON body; Nitro stores createError.data inside it.
  const details = record(payload?.data)
  const candidate = details?.retryable === false ? details.code : undefined
  const code: BoundedQwenPreviewErrorCode = typeof candidate === 'string' && Object.hasOwn(explanations, candidate)
    ? candidate as BoundedQwenPreviewErrorCode : 'UNKNOWN'
  return `診斷代碼：${code}。${explanations[code]} 系統未自動重試或改用其他 AI。此訊息不是費用回執，不能據此認定費用為零；請先核對用量，不要直接重送。`
}
