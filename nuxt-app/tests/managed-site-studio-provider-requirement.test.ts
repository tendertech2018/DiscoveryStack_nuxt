import { describe, expect, it } from 'vitest'
import { assertStudioProviderRequirement } from '../server/llm-provider/website-studio'
import { resolveAnthropicStudioConfiguration } from '../server/llm-provider/anthropic'

describe('provider-specific acceptance may only narrow server authority', () => {
  it('keeps existing clients compatible and accepts only configured Claude', () => {
    expect(() => assertStudioProviderRequirement(undefined)).not.toThrow()
    const claude = resolveAnthropicStudioConfiguration({ ANTHROPIC_API_KEY: 'synthetic-key-not-real' })
    expect(() => assertStudioProviderRequirement('anthropic', claude)).not.toThrow()
  })
  it('rejects missing or different providers before any paid request', () => {
    expect(() => assertStudioProviderRequirement('anthropic', { configured: false, reason: 'api-key-missing' })).toThrow()
    expect(() => assertStudioProviderRequirement('anthropic', { configured: true, endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: 'synthetic-not-real', model: 'test', providerLabel: 'openai', source: 'llm' })).toThrow()
    expect(() => assertStudioProviderRequirement('arbitrary-provider')).toThrow()
  })
})
