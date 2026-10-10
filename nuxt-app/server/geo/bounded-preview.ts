import { createAutoGeoOpenAiCompatibleAdapter } from './autogeo-openai-compatible'
import type { GeoRewriteAdapter, GeoRewriteProvenance } from './contracts'
import { AutoGeoUnsafeOutputError } from './output-safety'
import {
  createOpenAiCompatibleChatClient,
  normalizeOpenAiCompatibleEndpoint,
  openAiCompatibleProviderLabel,
  resolveOpenAiCompatibleProviderConfiguration,
  type OpenAiCompatibleProviderConfiguration,
} from '../llm-provider/openai-compatible'

export const BOUNDED_QWEN_PREVIEW_LIMITS = Object.freeze({
  model: 'qwen3.6-plus',
  snapshotModel: 'qwen3.6-plus-2026-04-02',
  timeoutMs: 60_000,
  maxRequestBytes: 64 * 1024,
  maxResponseBytes: 200_000,
  maxInputTokens: 256_000,
  maxOutputTokens: 2_048,
  budgetUsd: 1,
  inputUsdPerMillionTokens: 0.5,
  outputUsdPerMillionTokens: 3,
  priceCheckedAt: '2026-10-10',
  pricingUrl: 'https://www.alibabacloud.com/help/en/model-studio/model-pricing',
} as const)

export type BoundedQwenPreviewErrorCode =
  | 'CONFIGURATION' | 'ALREADY_USED' | 'REQUEST_TOO_LARGE' | 'TIMEOUT'
  | 'TRANSPORT' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'UPSTREAM'
  | 'RESPONSE_TOO_LARGE' | 'MALFORMED_RESPONSE' | 'MODEL_MISMATCH'
  | 'TRUNCATED_RESPONSE' | 'USAGE_INVALID' | 'BUDGET_EXCEEDED'
  | 'THINKING_NOT_DISABLED' | 'UNSAFE_OUTPUT' | 'UNKNOWN'

/** No upstream error, cause, body, credential, or submitted content is retained. */
export class BoundedQwenPreviewError extends Error {
  readonly retryable = false
  constructor(readonly code: BoundedQwenPreviewErrorCode) {
    super(`Bounded Qwen preview failed: ${code}.`)
    this.name = 'BoundedQwenPreviewError'
  }
}

type Receipt = NonNullable<GeoRewriteProvenance['boundedPreviewReceipt']>
const limits = BOUNDED_QWEN_PREVIEW_LIMITS
const fail = (code: BoundedQwenPreviewErrorCode) => new BoundedQwenPreviewError(code)
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

// Integer nano-dollars avoid rounding an over-budget amount down before comparison.
function estimatedCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 500 + outputTokens * 3_000) / 1_000_000_000
}

function acceptedEnvelope(value: unknown): {
  envelope: Record<string, unknown>
  receipt: Receipt
} {
  if (!record(value) || !Array.isArray(value.choices) || value.choices.length !== 1) throw fail('MALFORMED_RESPONSE')
  if (value.model !== limits.model && value.model !== limits.snapshotModel) throw fail('MODEL_MISMATCH')
  const choice = value.choices[0]
  if (!record(choice) || choice.index !== 0 || !record(choice.message) || choice.message.role !== 'assistant') throw fail('MALFORMED_RESPONSE')
  if (choice.finish_reason === 'length') throw fail('TRUNCATED_RESPONSE')
  if (choice.finish_reason !== 'stop' || typeof choice.message.content !== 'string' || !choice.message.content.trim() || choice.message.content.includes('\u0000')) throw fail('MALFORMED_RESPONSE')
  if (choice.message.tool_calls !== undefined || choice.message.function_call !== undefined) throw fail('MALFORMED_RESPONSE')
  if (choice.message.reasoning_content !== undefined && choice.message.reasoning_content !== null && choice.message.reasoning_content !== '') throw fail('THINKING_NOT_DISABLED')
  const usage = value.usage
  if (!record(usage) || !tokenCount(usage.prompt_tokens) || !tokenCount(usage.completion_tokens) || !tokenCount(usage.total_tokens)
    || usage.prompt_tokens + usage.completion_tokens !== usage.total_tokens
    || usage.prompt_tokens > limits.maxInputTokens || usage.completion_tokens > limits.maxOutputTokens) throw fail('USAGE_INVALID')
  if (usage.completion_tokens_details !== undefined) {
    if (!record(usage.completion_tokens_details)) throw fail('USAGE_INVALID')
    const reasoning = usage.completion_tokens_details.reasoning_tokens
    if (reasoning !== undefined && (!tokenCount(reasoning) || reasoning !== 0)) throw fail('THINKING_NOT_DISABLED')
  }
  const cost = estimatedCostUsd(usage.prompt_tokens, usage.completion_tokens)
  if (!Number.isFinite(cost) || cost > limits.budgetUsd) throw fail('BUDGET_EXCEEDED')
  return {
    // Pass only validated fields to the shared client. Never retain reasoning or raw metadata.
    envelope: {
      model: value.model,
      choices: [{ index: 0, message: { role: 'assistant', content: choice.message.content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens },
    },
    receipt: {
      version: 'bounded-qwen-preview-v1',
      budgetUsd: limits.budgetUsd,
      maxEstimatedCostUsd: estimatedCostUsd(limits.maxInputTokens, limits.maxOutputTokens),
      estimatedCostUsd: cost,
      maxInputTokens: limits.maxInputTokens,
      maxOutputTokens: limits.maxOutputTokens,
      inputUsdPerMillionTokens: limits.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: limits.outputUsdPerMillionTokens,
      priceCheckedAt: limits.priceCheckedAt,
      pricingUrl: limits.pricingUrl,
      attempts: 1,
      thinking: false,
    },
  }
}

/**
 * A per-request, single-use preview adapter. Configuration is resolved on the server
 * and copied once; the HTTP route must never forward client provider configuration.
 * This module has no database, publication, training, retry, or provider fallback.
 */
export function createBoundedQwenPreviewAdapter(options: {
  fetchImpl?: typeof fetch
  configuration?: OpenAiCompatibleProviderConfiguration
} = {}): GeoRewriteAdapter {
  let snapshot: { endpoint: string; model: string; apiKey: string }
  try {
    const configuration = options.configuration ?? resolveOpenAiCompatibleProviderConfiguration()
    if (!configuration.configured || configuration.providerLabel !== 'bailian' || configuration.model !== limits.model) throw fail('CONFIGURATION')
    const endpoint = normalizeOpenAiCompatibleEndpoint(configuration.endpoint)
    if (!endpoint || openAiCompatibleProviderLabel(endpoint) !== 'bailian' || !configuration.apiKey.trim()) throw fail('CONFIGURATION')
    snapshot = Object.freeze({ endpoint, model: configuration.model, apiKey: configuration.apiKey.trim() })
  } catch { throw fail('CONFIGURATION') }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  let used = false
  let attempted = false
  let transportFailure: BoundedQwenPreviewError | null = null
  let receipt: Receipt | null = null

  const boundedFetch: typeof fetch = async (request, init) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const controller = new AbortController()
    const cancelReader = () => { if (reader) void reader.cancel().catch(() => {}) }
    const abort = () => { controller.abort(); cancelReader() }
    init?.signal?.addEventListener('abort', abort, { once: true })
    try {
      if (attempted) throw fail('ALREADY_USED')
      if (request !== snapshot.endpoint || init?.method !== 'POST' || typeof init.body !== 'string') throw fail('CONFIGURATION')
      const body: unknown = JSON.parse(init.body)
      if (!record(body) || body.model !== snapshot.model || body.stream !== false || !Array.isArray(body.messages)
        || !body.messages.length || body.messages.some(message => !record(message) || !['system', 'user', 'assistant'].includes(String(message.role)) || typeof message.content !== 'string')) throw fail('CONFIGURATION')
      const promptBytes = body.messages.reduce((sum, message) => sum + Buffer.byteLength(message.content, 'utf8'), 0)
      const requestBody = JSON.stringify({ model: snapshot.model, stream: false, messages: body.messages, max_tokens: limits.maxOutputTokens, enable_thinking: false })
      // Both the complete prompt and final JSON request are bounded before any I/O.
      // This small UTF-8 text request stays far below the 256K input pricing tier.
      if (promptBytes > limits.maxRequestBytes || Buffer.byteLength(requestBody, 'utf8') > limits.maxRequestBytes) throw fail('REQUEST_TOO_LARGE')
      if (init.signal?.aborted) throw fail('TIMEOUT')
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { abort(); reject(fail('TIMEOUT')) }, limits.timeoutMs)
      })
      const operation = async () => {
        // Reserve the only network attempt before calling even an injected transport.
        attempted = true
        const response = await fetchImpl(snapshot.endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${snapshot.apiKey}` },
          body: requestBody,
        })
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw fail('TIMEOUT') }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {})
          if (response.status === 401 || response.status === 403) throw fail('UNAUTHORIZED')
          if (response.status === 429) throw fail('RATE_LIMITED')
          throw fail('UPSTREAM')
        }
        const declaredLength = response.headers.get('content-length')
        if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > limits.maxResponseBytes) {
          void response.body?.cancel().catch(() => {})
          throw fail('RESPONSE_TOO_LARGE')
        }
        if (!response.body) throw fail('MALFORMED_RESPONSE')
        reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8', { fatal: true })
        let bytes = 0
        let text = ''
        while (true) {
          const chunk = await reader.read()
          if (controller.signal.aborted) throw fail('TIMEOUT')
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > limits.maxResponseBytes) { cancelReader(); throw fail('RESPONSE_TOO_LARGE') }
          try { text += decoder.decode(chunk.value, { stream: true }) } catch { throw fail('MALFORMED_RESPONSE') }
        }
        try { text += decoder.decode() } catch { throw fail('MALFORMED_RESPONSE') }
        let payload: unknown
        try { payload = JSON.parse(text) } catch { throw fail('MALFORMED_RESPONSE') }
        const accepted = acceptedEnvelope(payload)
        receipt = accepted.receipt
        return new Response(JSON.stringify(accepted.envelope), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return await Promise.race([operation(), timeout])
    } catch (error) {
      transportFailure = error instanceof BoundedQwenPreviewError ? error : fail(controller.signal.aborted ? 'TIMEOUT' : 'TRANSPORT')
      // Stop the upstream body even when validation fails before EOF (for example
      // fatal UTF-8 decoding). Releasing a reader alone does not cancel its stream.
      abort()
      throw transportFailure
    } finally {
      if (timer) clearTimeout(timer)
      init?.signal?.removeEventListener('abort', abort)
      try { reader?.releaseLock() } catch { /* No upstream error escapes cleanup. */ }
    }
  }
  const client = createOpenAiCompatibleChatClient({ ...snapshot, fetchImpl: boundedFetch, timeoutMs: limits.timeoutMs, maxResponseBytes: limits.maxResponseBytes })
  const adapter = createAutoGeoOpenAiCompatibleAdapter({ client, timeoutMs: limits.timeoutMs })
  return {
    id: adapter.id,
    version: 'bounded-qwen-preview-v1',
    async rewrite(document, rules) {
      if (used) throw fail('ALREADY_USED')
      used = true
      try {
        const candidate = await adapter.rewrite(document, rules)
        if (!receipt) throw fail('MALFORMED_RESPONSE')
        return {
          ...candidate,
          provenance: { ...candidate.provenance, boundedPreviewReceipt: receipt },
          safetyNotes: [...candidate.safetyNotes, '單次有上限的待審閱草稿：不發布、不寫入資料庫、不用於訓練；費用為官方單價及 provider token usage 的估算，不是最終帳單。'],
        }
      } catch (error) {
        if (transportFailure) throw transportFailure
        // Deliberately do not propagate AutoGeoUnsafeOutputError: the caller must
        // fail closed rather than turn this paid test into any fallback result.
        if (error instanceof AutoGeoUnsafeOutputError) throw fail('UNSAFE_OUTPUT')
        if (error instanceof BoundedQwenPreviewError) throw error
        throw fail('UNKNOWN')
      }
    },
  }
}
