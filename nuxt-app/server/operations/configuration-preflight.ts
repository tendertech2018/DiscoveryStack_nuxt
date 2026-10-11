import { resolveOpenAiCompatibleProviderConfiguration } from '../llm-provider/openai-compatible'
import { managedSiteEmailReadinessFromEnv } from '../managed-sites/contact-inbox/email-transport'
import { isWeeklyLineAccessToken, normalizeWeeklyLinePublicOrigin, WEEKLY_LINE_USER_ID } from '../weekly-content/line-transport'
import { databaseConfigurationMetadata } from './database-diagnostics'

type Environment = Record<string, string | undefined>
export type ConfigurationCheck = { id: string; label: string; status: 'missing' | 'invalid' | 'configured_unverified' | 'disabled' | 'requires_acceptance'; code: string }

/** Pure configuration inspection: no DB, filesystem, provider requests, or returned values. */
export function operationsConfigurationPreflight(environment: Environment, runtimeConfig: Record<string, unknown> = {}) {
  const checks: ConfigurationCheck[] = []
  const database = databaseConfigurationMetadata(environment)
  checks.push({ id: 'database', label: '資料庫設定', status: !database.present ? 'missing' : !database.urlValid || database.tlsVerificationDisabled ? 'invalid' : 'configured_unverified', code: !database.present ? 'DATABASE_URL_MISSING' : !database.urlValid ? 'DATABASE_URL_INVALID' : database.tlsVerificationDisabled ? 'DATABASE_TLS_VERIFICATION_DISABLED' : database.tlsExplicit ? 'DATABASE_RUNTIME_CHECK_REQUIRED' : 'DATABASE_TLS_CONFIGURATION_REVIEW_REQUIRED' })
  let modelReady = false
  try { const model = resolveOpenAiCompatibleProviderConfiguration({ env: environment, runtimeConfig }); modelReady = model.configured && model.providerLabel === 'bailian' && model.model === 'qwen3.6-plus' } catch { /* Fixed code only. */ }
  checks.push({ id: 'bounded_ai', label: '單次限額 AI', status: modelReady ? 'configured_unverified' : 'invalid', code: modelReady ? 'AI_REAL_ACCEPTANCE_REQUIRED' : 'BOUNDED_QWEN_CONFIGURATION_INVALID' })
  const email = managedSiteEmailReadinessFromEnv(environment)
  const outboxKeysReady = (environment.NUXT_MANAGED_SITE_EMAIL_OUTBOX_ENCRYPTION_KEY || '').length >= 32 && (environment.NUXT_MANAGED_SITE_EMAIL_CODE_PEPPER || '').length >= 32
  checks.push({ id: 'email', label: '寄件服務與安全佇列', status: environment.NUXT_MANAGED_SITE_EMAIL_OUTBOX_ENABLED !== 'true' ? 'disabled' : email.configured && outboxKeysReady ? 'configured_unverified' : 'invalid', code: environment.NUXT_MANAGED_SITE_EMAIL_OUTBOX_ENABLED !== 'true' ? 'EMAIL_DISABLED' : email.configured && outboxKeysReady ? 'SENDER_DOMAIN_AND_DELIVERY_ACCEPTANCE_REQUIRED' : 'EMAIL_CONFIGURATION_INCOMPLETE' })
  let lineReady = false
  try { lineReady = isWeeklyLineAccessToken(environment.NUXT_WEEKLY_CONTENT_LINE_ACCESS_TOKEN || '') && WEEKLY_LINE_USER_ID.test(environment.NUXT_WEEKLY_CONTENT_LINE_BOT_USER_ID || '') && (environment.NUXT_WEEKLY_CONTENT_LINE_CHANNEL_SECRET || '').length >= 16 && (environment.NUXT_WEEKLY_CONTENT_TOKEN_KEY || '').length >= 32 && Boolean(normalizeWeeklyLinePublicOrigin(environment.NUXT_WEEKLY_CONTENT_REVIEW_ORIGIN || '')) } catch { /* Fixed code only. */ }
  checks.push({ id: 'line', label: 'LINE 逐稿核准', status: environment.NUXT_WEEKLY_CONTENT_APPROVAL_ENABLED !== 'true' ? 'disabled' : lineReady ? 'configured_unverified' : 'invalid', code: environment.NUXT_WEEKLY_CONTENT_APPROVAL_ENABLED !== 'true' ? 'LINE_REVIEW_DISABLED' : lineReady ? 'LINE_ACCOUNT_BINDING_ACCEPTANCE_REQUIRED' : 'LINE_CONFIGURATION_INCOMPLETE' })
  checks.push({ id: 'scheduler', label: '常駐排程', status: environment.NUXT_CONTENT_OPERATIONS_SCHEDULER_ENABLED === 'true' ? 'requires_acceptance' : 'disabled', code: environment.NUXT_CONTENT_OPERATIONS_SCHEDULER_ENABLED === 'true' ? 'ALWAYS_ON_RUNTIME_AND_SOAK_REQUIRED' : 'CONTENT_SCHEDULER_DISABLED' })
  for (const [id, label, code] of [
    ['measurement', 'GSC 與 GA4 帳號量測', 'PROPERTY_AUTHORIZATION_AND_BASELINE_REQUIRED'],
    ['publication', '指定網站發布', 'EXACT_SITE_APPROVAL_AND_RECEIPT_REQUIRED'],
    ['backup', '自動備份與隔離復原', 'SCHEDULE_OFFSITE_AND_RESTORE_ACCEPTANCE_REQUIRED'],
    ['alerts', '外部告警收件', 'ALERT_DELIVERY_ACCEPTANCE_REQUIRED'],
    ['learning', '正式模型與資料', 'GOVERNED_DATA_AND_MODEL_ACCEPTANCE_REQUIRED'],
  ]) checks.push({ id: id!, label: label!, status: 'requires_acceptance', code: code! })
  return { kind: 'configuration_only' as const, externalCallsPerformed: false as const, commercialReadinessEstablished: false as const, database, checks }
}
