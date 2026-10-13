import { createOpenAiCompatibleChatClient, resolveOpenAiCompatibleProviderConfiguration, type OpenAiCompatibleProviderConfiguration } from './openai-compatible'
import { createAnthropicStudioClient, resolveAnthropicStudioConfiguration, type AnthropicStudioConfiguration } from './anthropic'

export type WebsiteStudioProviderConfiguration = OpenAiCompatibleProviderConfiguration | AnthropicStudioConfiguration

/** This switch is studio-only; it cannot alter GEO, editor, training or observation providers. */
export function resolveWebsiteStudioProviderConfiguration(input: { env?: Record<string, string | undefined>; runtimeConfig?: Record<string, unknown> } = {}): WebsiteStudioProviderConfiguration {
  const env = input.env || process.env
  const provider = (env.NUXT_MANAGED_SITE_STUDIO_PROVIDER || '').trim()
  if (provider === 'anthropic') return resolveAnthropicStudioConfiguration(env)
  if (provider && provider !== 'openai_compatible') return { configured: false, reason: 'endpoint-not-allowed' }
  return resolveOpenAiCompatibleProviderConfiguration(input)
}

export function createWebsiteStudioChatClient(configuration: Extract<WebsiteStudioProviderConfiguration, { configured: true }>, fetchImpl?: typeof fetch) {
  return configuration.providerLabel === 'anthropic'
    ? createAnthropicStudioClient(configuration, fetchImpl)
    : createOpenAiCompatibleChatClient({ ...configuration, fetchImpl })
}

export function websiteStudioProviderKey(configuration: Extract<WebsiteStudioProviderConfiguration, { configured: true }>) {
  return configuration.providerLabel === 'anthropic' ? 'anthropic-messages:anthropic' : `openai-compatible:${configuration.providerLabel}`
}
