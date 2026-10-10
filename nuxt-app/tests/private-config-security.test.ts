import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('private config uses the authentication strength boundary', () => {
  it.each(['', 'short', ' xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'x'.repeat(4097)])('rejects an invalid session secret without disclosing it', async secret => {
    vi.stubEnv('NUXT_SESSION_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')
    vi.stubGlobal('useRuntimeConfig', () => ({ sessionSecret: secret, ownerOpenId: 'fixture-owner' }))
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('setHeader', vi.fn())
    const handler = (await import('../server/api/__private-config.get')).default
    expect(handler({} as any)).toEqual({ status: 'missing' })
  })
  it('accepts a strong runtime-only key but only emits a readiness status', async () => {
    vi.stubEnv('NUXT_SESSION_SECRET', 'synthetic-secret-with-at-least-thirty-two-bytes')
    vi.stubEnv('NUXT_OWNER_OPEN_ID', 'fixture-owner')
    vi.stubGlobal('useRuntimeConfig', () => ({}))
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('setHeader', vi.fn())
    const handler = (await import('../server/api/__private-config.get')).default
    expect(handler({} as any)).toEqual({ status: 'ready' })
  })
})
