import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isStrongSessionSecret, setOwnerSession } from '../server/utils/auth'
import {
  assertSimpleLoginRequestOrigin,
  clearSimpleLoginRateLimit,
  configuredSimpleLoginPassword,
  enforceSimpleLoginRateLimit,
  isStrongSimpleLoginPassword,
  ownerLoginRequestFingerprint,
  resetSimpleLoginRateLimitsForTests,
  resolveSimpleLoginOpenId,
} from '../server/utils/ownerSimpleLogin'
import {
  createProviderVaultKeyring,
  decryptProviderSecret,
  encryptProviderSecret,
  runtimeProviderMasterSecret,
} from '../server/utils/provider-vault'

const ENV_KEYS = [
  'OWNER_SIMPLE_LOGIN_ENABLED',
  'OWNER_SIMPLE_LOGIN_PASSWORD',
  'OWNER_OPEN_ID',
  'NUXT_OWNER_OPEN_ID',
  'NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN',
  'NUXT_SESSION_SECRET',
  'JWT_SECRET',
  'NUXT_PROVIDER_VAULT_KEY',
  'NUXT_PROVIDER_VAULT_KEY_ID',
  'NUXT_PROVIDER_VAULT_PREVIOUS_KEYS_JSON',
  'NUXT_PROVIDER_VAULT_LEGACY_SESSION_SECRETS_JSON',
] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))

function event(options: { peer?: string, forwarded?: string, origin?: string, fetchSite?: string, userAgent?: string } = {}) {
  return {
    context: {},
    node: {
      req: {
        headers: {
          'x-forwarded-for': options.forwarded,
          origin: options.origin,
          'sec-fetch-site': options.fetchSite,
          'user-agent': options.userAgent || 'security-test',
        },
        socket: { remoteAddress: options.peer || '203.0.113.10' },
      },
    },
  } as any
}

beforeEach(() => {
  resetSimpleLoginRateLimitsForTests()
  vi.useRealTimers()
  for (const key of ENV_KEYS) delete process.env[key]
})

afterEach(() => {
  resetSimpleLoginRateLimitsForTests()
  vi.useRealTimers()
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('owner authentication hardening', () => {
  it('accepts only bounded 32-byte session secrets without surrounding whitespace', () => {
    expect(isStrongSessionSecret('a'.repeat(32))).toBe(true)
    expect(isStrongSessionSecret('a'.repeat(31))).toBe(false)
    expect(isStrongSessionSecret(` ${'a'.repeat(32)}`)).toBe(false)
    expect(isStrongSessionSecret('密'.repeat(11))).toBe(true)
  })

  it('rejects a weak runtime signing secret before any database authority check', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ sessionSecret: 'short' }))
    try {
      await expect(setOwnerSession({} as any, { openId: 'existing-admin' })).rejects.toMatchObject({ statusCode: 503 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the temporary password fallback explicitly enabled, strong, and identity-bound', () => {
    process.env.OWNER_SIMPLE_LOGIN_PASSWORD = 'p'.repeat(32)
    process.env.OWNER_OPEN_ID = 'existing-admin'
    expect(configuredSimpleLoginPassword()).toBe('')
    process.env.OWNER_SIMPLE_LOGIN_ENABLED = 'true'
    expect(configuredSimpleLoginPassword()).toBe('p'.repeat(32))
    expect(resolveSimpleLoginOpenId()).toBe('existing-admin')
    expect(isStrongSimpleLoginPassword('p'.repeat(31))).toBe(false)
    expect(configuredSimpleLoginPassword('p'.repeat(32))).toBe('')
    process.env.NUXT_SESSION_SECRET = 'p'.repeat(32)
    expect(configuredSimpleLoginPassword()).toBe('')
    delete process.env.NUXT_SESSION_SECRET
    delete process.env.OWNER_OPEN_ID
    expect(configuredSimpleLoginPassword()).toBe('')
    expect(() => resolveSimpleLoginOpenId()).toThrow(/not configured/u)
  })

  it('does not let an arbitrary X-Forwarded-For value rotate the owner-login bucket', () => {
    const first = ownerLoginRequestFingerprint(event({ peer: '10.0.0.7', forwarded: '198.51.100.1' }))
    const second = ownerLoginRequestFingerprint(event({ peer: '10.0.0.7', forwarded: '198.51.100.200' }))
    const otherPeer = ownerLoginRequestFingerprint(event({ peer: '10.0.0.8', forwarded: '198.51.100.1' }))
    expect(second).toBe(first)
    expect(otherPeer).not.toBe(first)
  })

  it('does not let User-Agent rotation bypass the direct-peer owner-login limit', () => {
    const fingerprints = Array.from({ length: 6 }, (_, index) => ownerLoginRequestFingerprint(event({
      peer: '10.0.0.9',
      userAgent: `rotating-agent-${index}`,
    })))
    expect(new Set(fingerprints).size).toBe(1)
    for (const fingerprint of fingerprints.slice(0, 5)) enforceSimpleLoginRateLimit(fingerprint)
    expect(() => enforceSimpleLoginRateLimit(fingerprints[5]!)).toThrow(/Too many sign-in attempts/u)
  })

  it('requires the exact configured HTTPS origin and same-origin browser context', () => {
    process.env.NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN = 'https://ops.synthetic-ds.taipei'
    expect(() => assertSimpleLoginRequestOrigin(event({ origin: 'https://ops.synthetic-ds.taipei', fetchSite: 'same-origin' }))).not.toThrow()
    expect(() => assertSimpleLoginRequestOrigin(event({ origin: 'https://evil.example', fetchSite: 'cross-site' }))).toThrow(/configured private origin/u)
    process.env.NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN = 'http://ops.synthetic-ds.taipei'
    expect(() => assertSimpleLoginRequestOrigin(event({ origin: 'http://ops.synthetic-ds.taipei' }))).toThrow(/not configured/u)
  })

  it('limits each direct peer, retains a process-wide spray limit, and rolls the window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'))
    for (let attempt = 0; attempt < 5; attempt += 1) enforceSimpleLoginRateLimit('peer-a')
    expect(() => enforceSimpleLoginRateLimit('peer-a')).toThrow(/Too many sign-in attempts/u)
    clearSimpleLoginRateLimit('peer-a')
    expect(() => enforceSimpleLoginRateLimit('peer-a')).not.toThrow()
    vi.advanceTimersByTime(15 * 60 * 1_000)
    expect(() => enforceSimpleLoginRateLimit('peer-a')).not.toThrow()
  })

  it('does not let a denied owner-login peer drain the process-wide allowance', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) enforceSimpleLoginRateLimit('peer-a')
    for (let attempt = 0; attempt < 10; attempt += 1) expect(() => enforceSimpleLoginRateLimit('peer-a')).toThrow(/Too many sign-in attempts/u)
    for (let peer = 0; peer < 45; peer += 1) expect(() => enforceSimpleLoginRateLimit(`other-peer-${peer}`)).not.toThrow()
    expect(() => enforceSimpleLoginRateLimit('global-overflow-peer')).toThrow(/Too many sign-in attempts/u)
  })

  it('never creates a user or promotes a role from the temporary login route', () => {
    const source = readFileSync(join(process.cwd(), 'server/routes/owner-login.post.ts'), 'utf8')
    expect(source).toContain('await setOwnerSession')
    expect(source).not.toContain('database.insert(users)')
    expect(source).not.toContain("role: 'admin'")
    expect(source).not.toContain('onDuplicateKeyUpdate')
  })
})

describe('provider vault key rotation', () => {
  const oldKey = { id: 'key-2026-q3', secret: 'o'.repeat(32) }
  const newKey = { id: 'key-2026-q4', secret: 'n'.repeat(32) }

  it('writes randomized authenticated v2 envelopes and reads them with their key id', () => {
    const keyring = createProviderVaultKeyring({ primary: newKey })
    const first = encryptProviderSecret('provider-secret', keyring)
    const second = encryptProviderSecret('provider-secret', keyring)
    expect(first).toMatch(/^v2\.key-2026-q4\./u)
    expect(second).not.toBe(first)
    expect(decryptProviderSecret(first, keyring)).toBe('provider-secret')
  })

  it('decrypts the previous v2 key during rotation but never encrypts with it', () => {
    const before = createProviderVaultKeyring({ primary: oldKey })
    const payload = encryptProviderSecret('rotating-secret', before)
    const after = createProviderVaultKeyring({ primary: newKey, previous: [oldKey] })
    expect(decryptProviderSecret(payload, after)).toBe('rotating-secret')
    expect(encryptProviderSecret('new-secret', after)).toMatch(/^v2\.key-2026-q4\./u)
    expect(() => decryptProviderSecret(payload, createProviderVaultKeyring({ primary: newKey }))).toThrow(/cannot be decrypted/u)
  })

  it('retains controlled v1 reads while requiring an independent key for new runtime writes', () => {
    const legacySessionSecret = 'legacy-session-secret-value-1234'
    const legacy = encryptProviderSecret('legacy-provider-secret', legacySessionSecret)
    const transition = createProviderVaultKeyring({ legacySessionSecrets: [legacySessionSecret] })
    expect(legacy).toMatch(/^v1\./u)
    expect(decryptProviderSecret(legacy, transition)).toBe('legacy-provider-secret')
    expect(() => encryptProviderSecret('must-not-use-session-secret', transition)).toThrow(/not configured/u)
    const migrated = createProviderVaultKeyring({ primary: newKey, legacySessionSecrets: [legacySessionSecret] })
    expect(decryptProviderSecret(legacy, migrated)).toBe('legacy-provider-secret')
  })

  it('fails closed on tampering, malformed keyrings, and unknown envelope versions', () => {
    const keyring = createProviderVaultKeyring({ primary: newKey })
    const payload = encryptProviderSecret('provider-secret', keyring)
    const parts = payload.split('.')
    parts[3] = `${parts[3]!.startsWith('A') ? 'B' : 'A'}${parts[3]!.slice(1)}`
    const tampered = parts.join('.')
    expect(() => decryptProviderSecret(tampered, keyring)).toThrow(/cannot be decrypted/u)
    expect(() => decryptProviderSecret('v3.unknown.payload', keyring)).toThrow(/cannot be decrypted/u)
    expect(() => createProviderVaultKeyring({ primary: { id: 'bad.id', secret: 'x'.repeat(32) } })).toThrow(/not configured/u)
  })

  it('rejects a new vault primary reused by an active fallback or a current or explicit legacy session key', () => {
    const primary = 'v'.repeat(32)
    let sessionSecret = 's'.repeat(32)
    vi.stubGlobal('useRuntimeConfig', () => ({ sessionSecret }))
    try {
      process.env.NUXT_PROVIDER_VAULT_KEY = primary
      process.env.NUXT_PROVIDER_VAULT_KEY_ID = 'key-current'
      process.env.OWNER_SIMPLE_LOGIN_ENABLED = 'true'
      process.env.OWNER_SIMPLE_LOGIN_PASSWORD = primary
      process.env.OWNER_OPEN_ID = 'existing-admin'
      expect(configuredSimpleLoginPassword(sessionSecret)).toBe('')
      expect(() => runtimeProviderMasterSecret()).toThrow(/not configured/u)

      process.env.OWNER_SIMPLE_LOGIN_ENABLED = 'false'
      sessionSecret = primary
      expect(() => runtimeProviderMasterSecret()).toThrow(/not configured/u)

      sessionSecret = 's'.repeat(32)
      process.env.NUXT_PROVIDER_VAULT_LEGACY_SESSION_SECRETS_JSON = JSON.stringify([primary])
      expect(() => runtimeProviderMasterSecret()).toThrow(/not configured/u)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('allows duplicate legacy reads and previous-v2 keys while keeping an independent primary', () => {
    const primary = 'v'.repeat(32)
    const legacySessionSecret = 's'.repeat(32)
    vi.stubGlobal('useRuntimeConfig', () => ({ sessionSecret: legacySessionSecret }))
    try {
      process.env.NUXT_PROVIDER_VAULT_KEY = primary
      process.env.NUXT_PROVIDER_VAULT_KEY_ID = 'key-current'
      process.env.NUXT_PROVIDER_VAULT_PREVIOUS_KEYS_JSON = JSON.stringify({ 'key-previous': legacySessionSecret })
      process.env.NUXT_PROVIDER_VAULT_LEGACY_SESSION_SECRETS_JSON = JSON.stringify([legacySessionSecret, legacySessionSecret])
      const keyring = runtimeProviderMasterSecret()
      expect(keyring.primary).toEqual({ id: 'key-current', secret: primary })
      expect(keyring.previous).toEqual([{ id: 'key-previous', secret: legacySessionSecret }])
      expect(keyring.legacySessionSecrets).toEqual([legacySessionSecret])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
