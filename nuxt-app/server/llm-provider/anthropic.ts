import type { OpenAiCompatibleChatClient } from './openai-compatible'

export const ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_STUDIO_DEFAULT_MODEL = 'claude-sonnet-5-5'
const MODELS = new Set([ANTHROPIC_STUDIO_DEFAULT_MODEL, 'claude-sonnet-4-6'])
const MAX_OUTPUT_TOKENS = 12_288
type CompletionInput = Parameters<OpenAiCompatibleChatClient['complete']>[0]
export type AnthropicStudioConfiguration = {
  configured: true
  endpoint: typeof ANTHROPIC_MESSAGES_ENDPOINT
  providerLabel: 'anthropic'
  source: 'anthropic-studio'
  apiKey: string
  model: string
  workspaceId?: string
}
type ErrorCode = 'configuration' | 'timeout' | 'transport' | 'unauthorized' | 'rate_limited' | 'upstream' | 'malformed_response'
export class AnthropicProviderError extends Error {
  constructor(readonly code: ErrorCode, readonly httpStatus: number | null = null) {
    // Never attach upstream bodies, headers, request objects or original errors.
    super(`Claude provider unavailable: ${code}`)
    this.name = 'AnthropicProviderError'
  }
}

export function resolveAnthropicStudioConfiguration(env: Record<string, string | undefined>) {
  const apiKey = (env.ANTHROPIC_API_KEY || '').trim()
  const model = (env.ANTHROPIC_MODEL || ANTHROPIC_STUDIO_DEFAULT_MODEL).trim()
  const workspaceId = (env.ANTHROPIC_WORKSPACE_ID || '').trim()
  if (!apiKey || !/^[\x21-\x7e]{1,512}$/u.test(apiKey)) return { configured: false as const, reason: 'api-key-missing' as const }
  if (!MODELS.has(model)) return { configured: false as const, reason: 'model-invalid' as const }
  if (workspaceId && !/^wrkspc_[A-Za-z0-9]{8,120}$/u.test(workspaceId)) return { configured: false as const, reason: 'endpoint-not-allowed' as const }
  return { configured: true, endpoint: ANTHROPIC_MESSAGES_ENDPOINT, providerLabel: 'anthropic', source: 'anthropic-studio', apiKey, model, ...(workspaceId ? { workspaceId } : {}) } satisfies AnthropicStudioConfiguration
}

async function readBounded(response: Response, maximum: number): Promise<unknown> {
  const announced = response.headers.get('content-length')
  if (announced && /^\d+$/u.test(announced) && Number(announced) > maximum) {
    await response.body?.cancel()
    throw new AnthropicProviderError('malformed_response')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new AnthropicProviderError('malformed_response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) {
        await reader.cancel()
        throw new AnthropicProviderError('malformed_response')
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { reader.releaseLock() }
}

/** Native Messages transport. Fixed origin, bounded output, no tools/redirects/retries. */
export function createAnthropicStudioClient(configuration: AnthropicStudioConfiguration, fetchImpl: typeof fetch = globalThis.fetch) {
  if (configuration.endpoint !== ANTHROPIC_MESSAGES_ENDPOINT || !MODELS.has(configuration.model) || !/^[\x21-\x7e]{1,512}$/u.test(configuration.apiKey) || (configuration.workspaceId && !/^wrkspc_[A-Za-z0-9]{8,120}$/u.test(configuration.workspaceId))) throw new AnthropicProviderError('configuration')
  return {
    async complete(input: CompletionInput): Promise<{ content: string }> {
      if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 8 || input.messages.some(message => !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') || Buffer.byteLength(JSON.stringify(input.messages), 'utf8') > 100_000) throw new AnthropicProviderError('configuration')
      const messages = input.messages.filter(message => message.role !== 'system')
      if (!messages.length || messages[0]?.role !== 'user' || messages.at(-1)?.role !== 'user') throw new AnthropicProviderError('configuration')
      const timeoutMs = Number.isSafeInteger(input.timeoutMs) && Number(input.timeoutMs) > 0 ? Math.min(Number(input.timeoutMs), 90_000) : 90_000
      const maximum = Number.isSafeInteger(input.maxResponseBytes) && Number(input.maxResponseBytes) > 0 ? Math.min(Number(input.maxResponseBytes), 200_000) : 96_000
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(ANTHROPIC_MESSAGES_ENDPOINT, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': configuration.apiKey, 'anthropic-version': '2023-06-01', ...(configuration.workspaceId ? { 'anthropic-workspace-id': configuration.workspaceId } : {}) },
          body: JSON.stringify({
            model: configuration.model, max_tokens: MAX_OUTPUT_TOKENS, stream: false,
            system: input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n'), messages,
            // Sonnet 5.5 renamed disabled to between_tools. This request never declares tools.
            thinking: { type: configuration.model === ANTHROPIC_STUDIO_DEFAULT_MODEL ? 'between_tools' : 'disabled' },
          }),
        })
        if (!response.ok) {
          await response.body?.cancel()
          const code = [401, 403].includes(response.status) ? 'unauthorized' : response.status === 429 ? 'rate_limited' : 'upstream'
          throw new AnthropicProviderError(code, response.status)
        }
        if (response.redirected) throw new AnthropicProviderError('transport')
        const body = await readBounded(response, maximum) as any
        if (!body || body.type !== 'message' || body.role !== 'assistant' || !/^msg_[A-Za-z0-9_-]{1,160}$/u.test(body.id || '') || body.model !== configuration.model || body.stop_reason !== 'end_turn' || !Array.isArray(body.content) || body.content.length < 1 || body.content.length > 8 || body.content.some((block: any) => !block || block.type !== 'text' || typeof block.text !== 'string')) throw new AnthropicProviderError('malformed_response')
        const content = body.content.map((block: { text: string }) => block.text).join('')
        if (!content.trim()) throw new AnthropicProviderError('malformed_response')
        if (input.responseFormat === 'json_object') {
          const document = JSON.parse(content)
          if (!document || typeof document !== 'object' || Array.isArray(document)) throw new AnthropicProviderError('malformed_response')
        }
        return { content }
      } catch (error) {
        if (controller.signal.aborted) throw new AnthropicProviderError('timeout')
        if (error instanceof AnthropicProviderError) throw error
        throw new AnthropicProviderError(error instanceof SyntaxError ? 'malformed_response' : 'transport')
      } finally { clearTimeout(timer) }
    },
  }
}
