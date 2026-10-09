import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createError } from 'h3'

const LEGACY_VAULT_VERSION = 'v1'
const VAULT_VERSION = 'v2'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const MIN_VAULT_KEY_BYTES = 32
const MAX_SECRET_BYTES = 4_096
const MAX_ENVELOPE_BYTES = 64 * 1_024
const MAX_ROTATION_KEYS = 8
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u

export type ProviderVaultKey = Readonly<{ id: string, secret: string }>
export type ProviderVaultKeyring = Readonly<{
  primary: ProviderVaultKey | null
  previous: readonly ProviderVaultKey[]
  legacySessionSecrets: readonly string[]
}>

type ProviderVaultKeySource = string | ProviderVaultKeyring

function vaultConfigurationError() {
  return createError({ statusCode: 503, statusMessage: 'Provider vault is not configured.' })
}

function vaultDecryptionError() {
  return createError({ statusCode: 503, statusMessage: 'Stored provider credential cannot be decrypted.' })
}

function strongVaultKey(secret: string) {
  return secret === secret.trim() && Buffer.byteLength(secret, 'utf8') >= MIN_VAULT_KEY_BYTES && Buffer.byteLength(secret, 'utf8') <= MAX_SECRET_BYTES
}

function validLegacySecret(secret: string) {
  // Preserve the exact v1 contract for controlled reads only. New encryption
  // never uses these session secrets.
  return secret.length >= 16 && Buffer.byteLength(secret, 'utf8') <= MAX_SECRET_BYTES
}

function validateKey(key: ProviderVaultKey) {
  if (!KEY_ID_PATTERN.test(key.id) || !strongVaultKey(key.secret)) throw vaultConfigurationError()
  return Object.freeze({ id: key.id, secret: key.secret })
}

export function createProviderVaultKeyring(input: {
  primary?: ProviderVaultKey | null
  previous?: readonly ProviderVaultKey[]
  legacySessionSecrets?: readonly string[]
}): ProviderVaultKeyring {
  const primary = input.primary ? validateKey(input.primary) : null
  const previous = (input.previous || []).map(validateKey)
  const legacySessionSecrets = [...new Set(input.legacySessionSecrets || [])]
  if (previous.length > MAX_ROTATION_KEYS || legacySessionSecrets.length > MAX_ROTATION_KEYS) throw vaultConfigurationError()
  if (legacySessionSecrets.some(secret => !validLegacySecret(secret))) throw vaultConfigurationError()
  const ids = [primary?.id, ...previous.map(key => key.id)].filter((id): id is string => Boolean(id))
  if (new Set(ids).size !== ids.length) throw vaultConfigurationError()
  return Object.freeze({ primary, previous: Object.freeze(previous), legacySessionSecrets: Object.freeze(legacySessionSecrets) })
}

function legacyMasterKey(masterSecret: string) {
  if (!validLegacySecret(masterSecret)) throw vaultConfigurationError()
  return createHash('sha256').update(`discoverystack-provider-vault:${masterSecret}`).digest()
}

function versionedMasterKey(key: ProviderVaultKey) {
  validateKey(key)
  return createHash('sha256').update(`discoverystack-provider-vault:v2:${key.id}\0${key.secret}`).digest()
}

function encode(value: Buffer) { return value.toString('base64url') }
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw vaultDecryptionError()
  return Buffer.from(value, 'base64url')
}

function encryptLegacy(value: string, masterSecret: string) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', legacyMasterKey(masterSecret), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [LEGACY_VAULT_VERSION, encode(iv), encode(tag), encode(encrypted)].join('.')
}

function encryptVersioned(value: string, key: ProviderVaultKey) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', versionedMasterKey(key), iv)
  cipher.setAAD(Buffer.from(`${VAULT_VERSION}.${key.id}`, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VAULT_VERSION, key.id, encode(iv), encode(tag), encode(encrypted)].join('.')
}

export function encryptProviderSecret(value: string, source: ProviderVaultKeySource) {
  // String input remains a deliberately limited compatibility seam for callers
  // holding existing v1 test/maintenance flows. Runtime writes receive a
  // keyring and therefore require the independent v2 primary key.
  if (typeof source === 'string') return encryptLegacy(value, source)
  if (!source.primary) throw vaultConfigurationError()
  return encryptVersioned(value, source.primary)
}

function decryptLegacy(parts: string[], secrets: readonly string[]) {
  const [, ivPart, tagPart, encryptedPart] = parts
  if (!ivPart || !tagPart || !encryptedPart) throw vaultDecryptionError()
  const iv = decode(ivPart)
  const tag = decode(tagPart)
  const encrypted = decode(encryptedPart)
  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) throw vaultDecryptionError()
  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', legacyMasterKey(secret), iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch {
      // Rotation intentionally tries every configured legacy candidate while
      // exposing only one generic error to callers.
    }
  }
  throw vaultDecryptionError()
}

function decryptVersioned(parts: string[], keys: readonly ProviderVaultKey[]) {
  const [, keyId, ivPart, tagPart, encryptedPart] = parts
  if (!keyId || !ivPart || !tagPart || !encryptedPart || !KEY_ID_PATTERN.test(keyId)) throw vaultDecryptionError()
  const key = keys.find(candidate => candidate.id === keyId)
  if (!key) throw vaultDecryptionError()
  try {
    const iv = decode(ivPart)
    const tag = decode(tagPart)
    const encrypted = decode(encryptedPart)
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) throw vaultDecryptionError()
    const decipher = createDecipheriv('aes-256-gcm', versionedMasterKey(key), iv)
    decipher.setAAD(Buffer.from(`${VAULT_VERSION}.${key.id}`, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  } catch {
    throw vaultDecryptionError()
  }
}

export function decryptProviderSecret(payload: string | null | undefined, source: ProviderVaultKeySource) {
  if (!payload) return null
  if (Buffer.byteLength(payload, 'utf8') > MAX_ENVELOPE_BYTES) throw vaultDecryptionError()
  const parts = payload.split('.')
  if (parts[0] === LEGACY_VAULT_VERSION && parts.length === 4) {
    const secrets = typeof source === 'string' ? [source] : source.legacySessionSecrets
    return decryptLegacy(parts, secrets)
  }
  if (parts[0] === VAULT_VERSION && parts.length === 5) {
    const keyId = parts[1] || ''
    const keys = typeof source === 'string' ? [{ id: keyId, secret: source }] : [source.primary, ...source.previous].filter((key): key is ProviderVaultKey => Boolean(key))
    return decryptVersioned(parts, keys)
  }
  throw vaultDecryptionError()
}

function parsePreviousKeys(raw: string): ProviderVaultKey[] {
  if (!raw) return []
  if (Buffer.byteLength(raw, 'utf8') > 32 * 1_024) throw vaultConfigurationError()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw vaultConfigurationError()
    return Object.entries(parsed as Record<string, unknown>).map(([id, secret]) => ({ id, secret: typeof secret === 'string' ? secret : '' }))
  } catch {
    throw vaultConfigurationError()
  }
}

function parseLegacySessionSecrets(raw: string): string[] {
  if (!raw) return []
  if (Buffer.byteLength(raw, 'utf8') > 32 * 1_024) throw vaultConfigurationError()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.some(secret => typeof secret !== 'string')) throw vaultConfigurationError()
    return parsed as string[]
  } catch {
    throw vaultConfigurationError()
  }
}

export function runtimeProviderMasterSecret(): ProviderVaultKeyring {
  const runtime = useRuntimeConfig()
  const primarySecret = process.env.NUXT_PROVIDER_VAULT_KEY || ''
  const primaryId = process.env.NUXT_PROVIDER_VAULT_KEY_ID || 'primary'
  const runtimeSessionSecret = String(runtime.sessionSecret || process.env.NUXT_SESSION_SECRET || process.env.JWT_SECRET || '')
  const explicitLegacySessionSecrets = parseLegacySessionSecrets(process.env.NUXT_PROVIDER_VAULT_LEGACY_SESSION_SECRETS_JSON || '')
  const legacySessionSecrets = [runtimeSessionSecret, ...explicitLegacySessionSecrets]
    .filter(Boolean)
  const activeFallbackPassword = process.env.OWNER_SIMPLE_LOGIN_ENABLED === 'true'
    ? process.env.OWNER_SIMPLE_LOGIN_PASSWORD || ''
    : ''
  if (primarySecret && (legacySessionSecrets.includes(primarySecret) || activeFallbackPassword === primarySecret)) throw vaultConfigurationError()
  return createProviderVaultKeyring({
    primary: primarySecret ? { id: primaryId, secret: primarySecret } : null,
    previous: parsePreviousKeys(process.env.NUXT_PROVIDER_VAULT_PREVIOUS_KEYS_JSON || ''),
    legacySessionSecrets,
  })
}

export function redactProviderSecret(value: string | null | undefined) {
  if (!value) return { configured: false, last4: null }
  return { configured: true, last4: value.slice(-4) }
}
