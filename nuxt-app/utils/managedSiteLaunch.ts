import type { FunnelAnswersView } from './managedSiteFunnel'
import { journeyText } from './managedSiteJourneyCopy'
import { STUDIO_AUTHORIZATION_VERSION, STUDIO_DOMAIN_AUTHORIZATION_VERSION } from './managedSiteAuthorizationCopy'

export type LaunchRegistrant = { firstName: string; lastName: string; organization: string; address1: string; city: string; state: string; postalCode: string; country: string; phoneCountryCode: string; phone: string; email: string }
export type LaunchAvailability = { available: true; canonicalDomain: string; quoteFingerprint: string; expiresAt: string; customerPrice: { amountMinor: number; currency: 'TWD' } }
export type LaunchInbox = { status: 'unbound' | 'pending' | 'bound' | 'locked'; maskedEmail: string | null; resendAvailableAt: string | null; transportConfigured: boolean }
export type LaunchSession = {
  conversationLanguage?: string
  contactInbox?: LaunchInbox
  status: string; answers: FunnelAnswersView; consentVersion: string; consentSnapshot: { policyVersion: string; acceptedAt: string; scrolledToBottom: true } | null
  domainAvailability: LaunchAvailability | null; domainDelegationTerms: string; domainDelegationVersion: string
  domainRegistration: { delegated: true; canonicalDomain: string; registrant: LaunchRegistrant; termsVersion: string } | null
  previewUrl: string | null; studio?: { confirmed: boolean; hasProposal: boolean; proposalId: string | null; buildStarted?: boolean } | null; testMode?: boolean
}
export type LaunchQuote = {
  currency: 'TWD'; lines: { lineKey: string; description: string; lineAmountMinor: number; billing: 'one_time' | 'monthly' | 'annual' }[]
  totals: { dueTodayMinor: number; recurringMonthlyMinor: number; domainRenewalAnnualMinor: number }
  manualSetupModules: string[]; comingSoonModules: string[]
}
export type LaunchCatalog = {
  domainTlds: { tld: string; annualMinor: number }[]
  plans: { key: 'site_only' | 'site_geo' | 'site_geo_autopost'; monthlyMinor: number | null }[]
  cadence: { days: 3 | 7 | 15 | 30; monthlyMinor: number }[]
}
export type LaunchRequest = <T>(path: string, options: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown }) => Promise<T>
export type LaunchInput = {
  contact: { contactName: string; email: string; phone?: string }
  domain: { option: 'new'; name: string; tld: string }
  plan: { planKey: string; cadenceDays?: 3 | 7 | 15 | 30 }
  registrant: LaunchRegistrant; availability: LaunchAvailability; consentRead: boolean; consentChecked: boolean; delegated: boolean
}

export function launchQuoteLabel(line: LaunchQuote['lines'][number], language: string): string {
  const t = (key: Parameters<typeof journeyText>[1]) => journeyText(language, key)
  if (line.lineKey.startsWith('build-')) return t('website')
  if (line.lineKey.startsWith('design-')) return t('design')
  if (line.lineKey.startsWith('domain-')) return t('domain')
  if (line.lineKey.startsWith('monthly-plan-')) return t(line.lineKey.endsWith('site_geo_autopost') ? 'content' : line.lineKey.endsWith('site_geo') ? 'search' : 'basic')
  const module = line.lineKey.replace(/^(?:monthly-)?module-/u, '').replace(/-(?:setup|intent)$/u, '')
  const labels = { contact_lead_capture: t('contactForm'), google_booking_assisted_integration: `Google · ${t('booking')}`, shopify_commerce: `Shopify · ${t('commerce')}`, bounded_ai_assistant: t('assistant'), managed_content_admin: t('basic'), line_assisted_integration: 'LINE', geo_content_subscription: t('content'), geo_measurement_dashboard: t('search') } as Record<string, string>
  // Unknown catalogue additions keep their exact server label instead of being silently mislabelled.
  return labels[module] || line.description
}

export function launchAvailabilityCurrent(availability: LaunchAvailability | null, name: string, tld: string, now = Date.now()): boolean {
  return Boolean(availability && availability.canonicalDomain === `${name.toLowerCase()}.${tld.toLowerCase()}` && Date.parse(availability.expiresAt) > now)
}

export function launchRegistrantValid(value: LaunchRegistrant): boolean {
  return ['firstName', 'address1', 'city', 'postalCode', 'country', 'phoneCountryCode', 'phone', 'email'].every(key => value[key as keyof LaunchRegistrant].trim()) && /^[A-Z]{2}$/u.test(value.country) && /^\d{1,4}$/u.test(value.phoneCountryCode) && /^\d{4,15}$/u.test(value.phone) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.email)
}

/** Same token-bound server authorities as the detailed wizard, with one customer submission.
 * This deliberately does not send company/copy/modules, prices, a receipt, or publication authority.
 * Each response is retained immediately so a failed later operation is safely resumable.
 */
export async function prepareStudioLaunch(session: LaunchSession, input: LaunchInput, request: LaunchRequest, onSaved: (session: LaunchSession) => void, now = Date.now()): Promise<LaunchQuote> {
  if (!session.studio?.confirmed || session.studio.buildStarted || session.status !== 'active') throw new Error('LAUNCH_CONFIRM_REQUIRED')
  if (!input.contact.contactName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.contact.email) || !launchRegistrantValid(input.registrant) || !input.plan.planKey || input.plan.planKey === 'site_geo_autopost' && !input.plan.cadenceDays) throw new Error('LAUNCH_DETAILS_REQUIRED')
  if (!input.consentRead || !input.consentChecked || !input.delegated || session.consentVersion !== STUDIO_AUTHORIZATION_VERSION || session.domainDelegationVersion !== STUDIO_DOMAIN_AUTHORIZATION_VERSION) throw new Error('LAUNCH_CONSENT_REQUIRED')
  if (!launchAvailabilityCurrent(input.availability, input.domain.name, input.domain.tld, now)) throw new Error('LAUNCH_DOMAIN_EXPIRED')
  let saved = await request<LaunchSession>('', { method: 'PATCH', body: { step: 8, answers: { contact: { contactName: input.contact.contactName.trim(), email: input.contact.email.trim(), ...(input.contact.phone?.trim() ? { phone: input.contact.phone.trim() } : {}) }, domain: { ...input.domain }, plan: { ...input.plan } } } })
  onSaved(saved)
  saved = await request<LaunchSession>('/consent', { method: 'POST', body: { policyVersion: session.consentVersion, scrolledToBottom: true } })
  onSaved(saved)
  saved = await request<LaunchSession>('/domain-delegation', { method: 'POST', body: { delegated: true, registrant: { ...input.registrant }, quoteFingerprint: input.availability.quoteFingerprint, termsVersion: session.domainDelegationVersion } })
  onSaved(saved)
  return request<LaunchQuote>('/quote', { method: 'POST', body: {} })
}

/** No raw transport errors, session tokens or provider text enter the customer interface. */
export function studioLaunchErrorKind(cause: unknown): 'conflict' | 'wait' | 'unavailable' | 'details' {
  const error = cause as { statusCode?: number; status?: number; data?: { statusCode?: number }; message?: string }
  const code = error?.statusCode || error?.status || error?.data?.statusCode
  if (code === 409 || error?.message === 'LAUNCH_DOMAIN_EXPIRED' || error?.message === 'LAUNCH_CONFIRM_REQUIRED') return 'conflict'
  if (code === 429) return 'wait'
  if (code === 422 || error?.message?.startsWith('LAUNCH_')) return 'details'
  return 'unavailable'
}
