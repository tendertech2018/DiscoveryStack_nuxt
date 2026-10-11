export type DatabaseProbeStage = 'configuration' | 'connect' | 'health' | 'ledger'

export function readinessTimeoutMs(environment: Record<string, string | undefined>): number {
  const value = environment.NUXT_OPERATIONS_READINESS_TIMEOUT_MS?.trim()
  if (!value) return 2_000
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(5_000, Math.max(250, Math.round(parsed))) : 2_000
}

export function databaseConfigurationMetadata(environment: Record<string, string | undefined>) {
  const present = Boolean(environment.DATABASE_URL?.trim())
  let urlValid = false, tlsExplicit = false, tlsVerificationDisabled = false
  try {
    const url = new URL(environment.DATABASE_URL || '')
    urlValid = url.protocol === 'mysql:' && Boolean(url.hostname && url.pathname.length > 1 && url.username) && !url.hash
    if (url.searchParams.has('ssl')) {
      const ssl: unknown = JSON.parse(url.searchParams.get('ssl')!)
      tlsExplicit = ssl === true || typeof ssl === 'string' && ssl.length > 0 || typeof ssl === 'object' && ssl !== null && !Array.isArray(ssl)
      tlsVerificationDisabled = typeof ssl === 'object' && ssl !== null && 'rejectUnauthorized' in ssl && ssl.rejectUnauthorized === false
    }
  } catch { urlValid = false }
  return { present, urlValid, tlsExplicit, tlsVerificationDisabled, timeoutMs: readinessTimeoutMs(environment) }
}

const codes: Record<string, string> = {
  ER_ACCESS_DENIED_ERROR: 'DATABASE_AUTH_REJECTED', ER_DBACCESS_DENIED_ERROR: 'DATABASE_AUTH_REJECTED',
  ENOTFOUND: 'DATABASE_DNS_FAILED', EAI_AGAIN: 'DATABASE_DNS_FAILED',
  ECONNREFUSED: 'DATABASE_CONNECTION_REFUSED', ETIMEDOUT: 'DATABASE_CHECK_TIMEOUT',
  HANDSHAKE_SSL_ERROR: 'DATABASE_TLS_FAILED', CERT_HAS_EXPIRED: 'DATABASE_TLS_FAILED',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'DATABASE_TLS_FAILED', UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'DATABASE_TLS_FAILED',
  ER_BAD_DB_ERROR: 'DATABASE_NAME_UNAVAILABLE',
}

export function safeDatabaseFailureCode(error: unknown, stage: DatabaseProbeStage): string {
  try {
    if (!error || typeof error !== 'object') return 'DATABASE_QUERY_FAILED'
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
    const code = descriptor && 'value' in descriptor ? descriptor.value : undefined
    if (stage === 'ledger' && code === 'ER_NO_SUCH_TABLE') return 'MIGRATION_LEDGER_UNAVAILABLE'
    return typeof code === 'string' && Object.hasOwn(codes, code) ? codes[code]! : 'DATABASE_QUERY_FAILED'
  } catch { return 'DATABASE_QUERY_FAILED' }
}

export class SafeDatabaseProbeError extends Error {
  constructor(readonly reasonCode: string, readonly stage: DatabaseProbeStage) { super('Database readiness probe failed.'); this.name = 'SafeDatabaseProbeError' }
}
