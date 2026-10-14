import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { prepareStudioLaunch, launchAvailabilityCurrent, launchRegistrantValid, studioLaunchErrorKind, type LaunchInput, type LaunchSession } from '../utils/managedSiteLaunch'
import { JOURNEY_LANGUAGES, journeyText } from '../utils/managedSiteJourneyCopy'
import { DEFAULT_STUDIO_DESIGN, isStudioDesign } from '../utils/managedSitePresentation'
import { extractStudioDesignTuning, extractStudioReference } from '../server/managed-sites/funnel/studio-reference'
import { STUDIO_AUTHORIZATION_VERSION, STUDIO_DOMAIN_AUTHORIZATION_VERSION, studioAuthorizationCopy, studioDomainAuthorizationCopy } from '../utils/managedSiteAuthorizationCopy'

const now = Date.parse('2026-10-14T01:00:00Z')
function fixture() {
  const availability = { available: true as const, canonicalDomain: 'test-brand.com', quoteFingerprint: 'a'.repeat(64), expiresAt: new Date(now + 60_000).toISOString(), customerPrice: { amountMinor: 600, currency: 'TWD' as const } }
  const session: LaunchSession = { status: 'active', answers: {}, consentVersion: STUDIO_AUTHORIZATION_VERSION, consentSnapshot: null, domainAvailability: availability, domainDelegationVersion: STUDIO_DOMAIN_AUTHORIZATION_VERSION, domainDelegationTerms: 'Terms', domainRegistration: null, previewUrl: null, studio: { confirmed: true, hasProposal: true, proposalId: 'b'.repeat(64) } }
  const input: LaunchInput = { contact: { contactName: 'Ada', email: 'ada@example.com' }, domain: { option: 'new', name: 'test-brand', tld: 'com' }, plan: { planKey: 'site_only' }, registrant: { firstName: 'Ada', lastName: '', organization: '', address1: '1 Example Street', city: 'Paris', state: '', postalCode: '75001', country: 'FR', phoneCountryCode: '33', phone: '123456789', email: 'ada@example.com' }, availability, consentRead: true, consentChecked: true, delegated: true }
  const request = vi.fn(async (path: string) => path === '/quote' ? { currency: 'TWD', lines: [], totals: {} } : { ...session, status: 'active' })
  return { session, input, request, onSaved: vi.fn() }
}
describe('one-page studio launch, existing server authority', () => {
  it('saves only remaining details and obtains canonical quote with no build, checkout or AI call', async () => {
    const f = fixture()
    await prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)
    expect(f.request.mock.calls.map(([path]) => path)).toEqual(['', '/consent', '/domain-delegation', '/quote'])
    expect(f.request).toHaveBeenNthCalledWith(1, '', { method: 'PATCH', body: { step: 8, answers: { contact: f.input.contact, domain: f.input.domain, plan: f.input.plan } } })
    const serialized = JSON.stringify(f.request.mock.calls)
    expect(serialized).not.toMatch(/amount|price|company|modules|HTML|proposalId/iu)
    expect(f.onSaved).toHaveBeenCalledTimes(3)
  })
  it.each(['consentRead', 'consentChecked', 'delegated'] as const)('cannot submit without %s', async key => {
    const f = fixture(); f.input[key] = false
    await expect(prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)).rejects.toThrow('LAUNCH_CONSENT_REQUIRED')
    expect(f.request).not.toHaveBeenCalled()
  })
  it('cannot reuse a stale or differently named domain quote', async () => {
    const f = fixture(); f.input.domain.name = 'another-brand'
    await expect(prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)).rejects.toThrow('LAUNCH_DOMAIN_EXPIRED')
    expect(launchAvailabilityCurrent(f.input.availability, 'test-brand', 'com', now + 60_000)).toBe(false)
    expect(f.request).not.toHaveBeenCalled()
  })
  it('does not rewrite copy or confirm a draft on behalf of the customer', async () => {
    const f = fixture(); f.session.studio!.confirmed = false
    await expect(prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)).rejects.toThrow('LAUNCH_CONFIRM_REQUIRED')
    expect(f.request).not.toHaveBeenCalled()
  })
  it('retains partial successful save receipts, stops after failure and does not advance to payment', async () => {
    const f = fixture(); f.request.mockRejectedValueOnce({ statusCode: 409 })
    await expect(prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)).rejects.toEqual({ statusCode: 409 })
    expect(f.request).toHaveBeenCalledTimes(1); expect(f.onSaved).not.toHaveBeenCalled()
    f.request.mockClear(); f.request.mockResolvedValueOnce(f.session).mockRejectedValueOnce({ statusCode: 503 })
    await expect(prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)).rejects.toEqual({ statusCode: 503 })
    expect(f.request).toHaveBeenCalledTimes(2); expect(f.onSaved).toHaveBeenCalledWith(f.session)
  })
  it('requires a real registrant and an explicitly chosen content cadence', async () => {
    const f = fixture(); f.input.plan = { planKey: 'site_geo_autopost' }
    await expect(prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)).rejects.toThrow('LAUNCH_DETAILS_REQUIRED')
    expect(launchRegistrantValid({ ...f.input.registrant, country: '' })).toBe(false)
    expect(launchRegistrantValid({ ...f.input.registrant, email: 'invalid' })).toBe(false)
  })
  it('does not expose raw provider errors or tokens', () => {
    expect(studioLaunchErrorKind({ statusCode: 503, message: 'secret-provider-details' })).toBe('unavailable')
    expect(studioLaunchErrorKind({ statusCode: 409 })).toBe('conflict')
    expect(studioLaunchErrorKind({ statusCode: 429 })).toBe('wait')
    expect(studioLaunchErrorKind(new Error('LAUNCH_DETAILS_REQUIRED'))).toBe('details')
  })
  it.each(JOURNEY_LANGUAGES)('has native critical checkout actions for %s without a model call', language => {
    for (const key of ['idea', 'review', 'launch', 'title', 'save', 'pay', 'agree', 'noCharge', 'conflict'] as const) {
      expect(journeyText(language, key)).toBeTruthy()
      if (language !== 'en') expect(journeyText(language, key)).not.toBe(journeyText('en', key))
    }
    expect(studioAuthorizationCopy(language)).toHaveLength(6)
    expect(studioDomainAuthorizationCopy(language, '中文原文')).toBeTruthy()
  })
  it('cannot accept a new server consent version using an old displayed translation', async () => {
    const f = fixture(); f.session.consentVersion = 'future-consent'
    await expect(prepareStudioLaunch(f.session, f.input, f.request as any, f.onSaved, now)).rejects.toThrow('LAUNCH_CONSENT_REQUIRED')
    expect(f.request).not.toHaveBeenCalled()
  })
  it('routes confirmed studios through the compact panel without changing legacy server steps', () => {
    const start = readFileSync(new URL('../pages/customer/managed-sites/start.vue', import.meta.url), 'utf8')
    expect(start).toContain('<StudioLaunchPanel v-else-if="compactLaunch"')
    expect(start).toContain('sessionProjection.value?.studio?.confirmed && !showDesignStudio.value')
    const panel = readFileSync(new URL('../components/StudioLaunchPanel.vue', import.meta.url), 'utf8')
    expect(panel).not.toMatch(/localStorage|sessionStorage|v-html|fetch\(/u)
    expect(panel).toContain('!reviewed.value || !previewUrl.value || !quote.value || paid.value')
    expect(panel).toContain("if (busy.value) return")
    expect(panel).toContain("registrant.value.email === previous")
  })
})
describe('reference-informed design details', () => {
  it('extracts bounded spacing, weight, proportions, corners, navigation and buttons', () => {
    const tuning = extractStudioDesignTuning('.hero{padding:96px;aspect-ratio:21/9;border-radius:32px}h1{font-weight:600}header{position:sticky}.btn{background:#442211}')
    expect(tuning).toEqual({ density: 'airy', imageRatio: 'wide', corners: 'round', headingWeight: 600, navigation: 'sticky', button: 'solid' })
    expect(isStudioDesign({ ...DEFAULT_STUDIO_DESIGN, tuning })).toBe(true)
    expect(isStudioDesign({ ...DEFAULT_STUDIO_DESIGN, tuning: { ...tuning, css: 'url(secret)' } })).toBe(false)
    expect(isStudioDesign({ ...DEFAULT_STUDIO_DESIGN, tuning: { ...tuning, headingWeight: 900 } })).toBe(false)
  })
  it('uses the actual body canvas rather than the first unrelated button background', () => {
    const ref = extractStudioReference('https://reference.test', '<style>.btn{background:#991111}body{background:#faf9f6}.hero{padding:24px}</style>', [], true)
    expect(ref.design.canvas).toBe('#faf9f6'); expect(ref.design.tuning?.density).toBe('compact')
    expect(ref.limitations).toContain('PUBLIC_HTML_AND_CSS_SIGNALS_NOT_RENDERED_PIXEL_COMPARISON')
  })
  it('preserves the schema for existing untuned designs', () => {
    expect(isStudioDesign(DEFAULT_STUDIO_DESIGN)).toBe(true)
    expect(isStudioDesign({ ...DEFAULT_STUDIO_DESIGN, tuning: { density: 'airy' } })).toBe(false)
  })
})
