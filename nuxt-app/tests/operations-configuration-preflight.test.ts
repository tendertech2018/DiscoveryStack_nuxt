import { describe, expect, it, vi } from 'vitest'
import { operationsConfigurationPreflight } from '../server/operations/configuration-preflight'
import { buildOperationsAlertPlan } from '../server/operations/alert-plan'
import { databaseConfigurationMetadata, readinessTimeoutMs, safeDatabaseFailureCode } from '../server/operations/database-diagnostics'

describe('configuration-only launch preflight', () => {
  it('keeps all real acceptance gates open with no fake success when settings are missing', () => {
    const result = operationsConfigurationPreflight({})
    expect(result).toMatchObject({ kind: 'configuration_only', externalCallsPerformed: false, commercialReadinessEstablished: false })
    expect(result.checks).toContainEqual({ id: 'database', label: '資料庫設定', status: 'missing', code: 'DATABASE_URL_MISSING' })
    expect(result.checks.find(row => row.id === 'email')?.status).toBe('disabled')
    expect(result.checks.find(row => row.id === 'learning')?.status).toBe('requires_acceptance')
  })
  it('never returns supplied credential, user, host, path, sender or raw URL values', () => {
    const environment = { DATABASE_URL: 'mysql://synthetic-user:synthetic-password@synthetic-host/private_db?ssl=%7B%22rejectUnauthorized%22%3Afalse%7D', NUXT_LLM_ENDPOINT: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', NUXT_LLM_API_KEY: 'synthetic-private-key', NUXT_LLM_MODEL: 'qwen3.6-plus', NUXT_MANAGED_SITE_EMAIL_FROM: 'secret@synthetic.example', NUXT_MANAGED_SITE_EMAIL_API_KEY: 'secret-mail-key', NUXT_MANAGED_SITE_EMAIL_OUTBOX_ENABLED: 'true' }
    const result = operationsConfigurationPreflight(environment)
    expect(result.checks.find(row => row.id === 'database')).toMatchObject({ status: 'invalid', code: 'DATABASE_TLS_VERIFICATION_DISABLED' })
    expect(result.checks.find(row => row.id === 'bounded_ai')?.status).toBe('configured_unverified')
    for (const value of ['synthetic-user', 'synthetic-password', 'synthetic-host', 'private_db', 'synthetic-private-key', 'secret@', 'secret-mail-key', 'https://']) expect(JSON.stringify(result)).not.toContain(value)
  })
  it.each(['', '   ', undefined, 'NaN'])('uses the documented default instead of a 250ms accidental deadline for %j', value => {
    expect(readinessTimeoutMs({ NUXT_OPERATIONS_READINESS_TIMEOUT_MS: value })).toBe(2000)
  })
  it('bounds explicit deadlines and distinguishes invalid URL from missing TLS configuration', () => {
    expect(readinessTimeoutMs({ NUXT_OPERATIONS_READINESS_TIMEOUT_MS: '90000' })).toBe(5000)
    expect(readinessTimeoutMs({ NUXT_OPERATIONS_READINESS_TIMEOUT_MS: '0' })).toBe(250)
    expect(databaseConfigurationMetadata({ DATABASE_URL: 'not-a-url' })).toMatchObject({ present: true, urlValid: false })
    expect(databaseConfigurationMetadata({ DATABASE_URL: 'mysql://u:p@example.test/db' })).toMatchObject({ urlValid: true, tlsExplicit: false })
    expect(databaseConfigurationMetadata({ DATABASE_URL: 'mysql://u:p@example.test/db?ssl=%7B%7D' })).toMatchObject({ urlValid: true, tlsExplicit: true, tlsVerificationDisabled: false })
  })
  it.each([['ER_ACCESS_DENIED_ERROR', 'DATABASE_AUTH_REJECTED'], ['ENOTFOUND', 'DATABASE_DNS_FAILED'], ['CERT_HAS_EXPIRED', 'DATABASE_TLS_FAILED'], ['ETIMEDOUT', 'DATABASE_CHECK_TIMEOUT'], ['synthetic-secret', 'DATABASE_QUERY_FAILED'], ['toString', 'DATABASE_QUERY_FAILED']])('maps %s to a fixed diagnostic only', (code, expected) => {
    expect(safeDatabaseFailureCode({ code, message: 'private SQL' }, 'connect')).toBe(expected)
  })
  it('does not invoke error getters or expose untrusted names in alerts', () => {
    const getter = vi.fn(() => { throw new Error('secret getter') })
    expect(safeDatabaseFailureCode(Object.defineProperty({}, 'code', { get: getter }), 'connect')).toBe('DATABASE_QUERY_FAILED')
    expect(getter).not.toHaveBeenCalled()
    expect(safeDatabaseFailureCode({ code: 'ER_NO_SUCH_TABLE' }, 'ledger')).toBe('MIGRATION_LEDGER_UNAVAILABLE')
    expect(safeDatabaseFailureCode({ code: 'ER_NO_SUCH_TABLE' }, 'health')).toBe('DATABASE_QUERY_FAILED')
    const plan = buildOperationsAlertPlan(false, [{ name: 'weekly-content:tick', status: 'failing' }, { name: 'weekly-content:tick', status: 'failing' }, { name: 'synthetic-secret', status: 'failing' }])
    expect(plan.alerts).toHaveLength(2)
    expect(plan.externalNotificationSent).toBe(false)
    expect(JSON.stringify(plan)).not.toContain('synthetic-secret')
  })
})
