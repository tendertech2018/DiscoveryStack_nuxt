import { describe, expect, it } from 'vitest'
import { buildManagedSiteMonthlyReport, monthInTimeZone, monthlyReportWindow, type MonthlyObservation } from '../server/managed-sites/monthly-report'
import { monthlyReportCsv } from '../utils/managedSiteMonthlyReport'
import { managedSiteReportCopy } from '../utils/managedSiteReportCopy'

const row = (id: number, patch: Partial<MonthlyObservation> = {}): MonthlyObservation => ({ id, queryId: 1, promptText: 'Original question?', locale: 'en', provider: 'chatgpt', observedAt: '2026-09-10T00:00:00Z', observationMode: 'manual_verified', brandMentioned: true, citationUrls: ['https://brand.acme.taipei/services'], reviewStatus: 'approved', ...patch })
const input = (observations: MonthlyObservation[]) => ({ brandName: 'Acme', domain: 'brand.acme.taipei', locale: 'en', month: '2026-09', timeZone: 'Asia/Taipei', now: new Date('2026-10-05T12:00:00Z'), evidence: { queries: [{ id: 1, promptText: 'Edited current question?', locale: 'en', active: true }, { id: 2, promptText: 'Unobserved question?', locale: 'fr', active: true }], observations } })

describe('monthly reporting evidence and calendar boundaries', () => {
  it('counts verified website citations rather than unrelated links or provider API scores', () => {
    const report = buildManagedSiteMonthlyReport(input([row(1), row(2, { citationUrls: ['https://other.acme.taipei/'] }), row(3, { citationUrls: [], brandMentioned: false }), row(4, { observationMode: 'provider_api_observation' }), row(5, { reviewStatus: 'pending' }), row(6, { reviewStatus: 'revoked' })]))
    expect(report.sampleCount).toBe(3)
    expect(report.labels).toEqual({ cited: 1, mentioned_without_citation: 1, not_mentioned: 1 })
    expect(report.estimates.citation?.rate).toBeCloseTo(1 / 3)
    expect(report.estimates.mention?.rate).toBeCloseTo(2 / 3)
    expect(report.estimates.citation?.confidenceInterval.lower).toBeLessThan(1 / 3)
    expect(report.observedQueries).toBe(1); expect(report.trackedQueries).toBe(2)
    expect(report.entityAccuracy).toBeNull(); expect(report.attributedConversions).toBeNull(); expect(report.attributedVisits).toBeNull()
  })
  it('preserves historical question versions and keeps never-observed questions separate', () => {
    const report = buildManagedSiteMonthlyReport(input([row(1), row(2, { promptText: 'New question version?', citationUrls: [] })]))
    expect(report.questions.map(item => item.question)).toEqual(['Unobserved question?', 'New question version?', 'Original question?'])
    expect(report.questions[0]?.action).toBe('observe')
    expect(report.questions[1]?.action).toBe('improve_sources')
    expect(JSON.stringify(report)).not.toContain('Edited current question')
  })
  it('does not invent text for legacy observations without a prompt snapshot', () => {
    const report = buildManagedSiteMonthlyReport(input([row(1, { promptText: null })]))
    expect(report.limitations).toContain('historical_prompt_text_unavailable')
    expect(report.questions.some(item => item.question === 'Edited current question?')).toBe(false)
  })
  it('keeps zero evidence unknown and a single sample explicitly non-trending', () => {
    const zero = buildManagedSiteMonthlyReport(input([])), one = buildManagedSiteMonthlyReport(input([row(1)]))
    expect(zero.status).toBe('insufficient_data'); expect(zero.estimates.citation).toBeNull()
    expect(one.limitations).toContain('single_sample_not_trend')
    expect(one).not.toHaveProperty('delta'); expect(one).not.toHaveProperty('predictedCitationProbability')
  })
  it('uses the customer calendar month and excludes future samples', () => {
    const report = buildManagedSiteMonthlyReport(input([row(1, { observedAt: '2026-08-31T16:00:00Z' }), row(2, { observedAt: '2026-09-30T15:59:59Z' }), row(3, { observedAt: '2026-09-30T16:00:00Z' }), row(4, { observedAt: '2026-08-31T15:59:59Z' })]))
    expect(report.sampleCount).toBe(2)
    const current = { ...input([row(1, { observedAt: '2026-09-15T00:00:00Z' })]), now: new Date('2026-09-14T00:00:00Z') }
    expect(buildManagedSiteMonthlyReport(current).sampleCount).toBe(0)
    expect(buildManagedSiteMonthlyReport(current).periodComplete).toBe(false)
  })
  it('handles DST and negative offsets without treating every month as 30 days', () => {
    expect(monthInTimeZone(new Date('2026-11-01T06:30:00Z'), 'America/New_York')).toBe('2026-11')
    expect(monthInTimeZone(new Date('2026-10-01T01:00:00Z'), 'America/Los_Angeles')).toBe('2026-09')
    const window = monthlyReportWindow('2024-02', 'Pacific/Kiritimati', new Date('2026-10-01'))
    expect(window.from.toISOString()).toBe('2024-01-30T12:00:00.000Z')
    expect(window.until.toISOString()).toBe('2024-03-02T12:00:00.000Z')
  })
  it.each(['2026-13', '2026-00', '2026-9', '1999-12', '2027-01', '2026-09&owner=2'])('rejects invalid/future month %s', month => {
    expect(() => monthlyReportWindow(month, 'Asia/Taipei', new Date('2026-10-05'))).toThrow()
  })
  it('fails closed on duplicate, excessive and malformed evidence rather than truncating counts', () => {
    expect(() => buildManagedSiteMonthlyReport(input([row(1), row(1)]))).toThrow(/Duplicate/u)
    expect(() => buildManagedSiteMonthlyReport(input(Array.from({ length: 2001 }, (_, index) => row(index))))).toThrow(/limit/u)
    expect(() => buildManagedSiteMonthlyReport(input([row(1, { observedAt: 'not-a-date' })]))).toThrow()
    expect(() => monthlyReportWindow('2026-09', 'Bad/Zone')).toThrow()
  })
  it('separates languages, assistants and inactive questions', () => {
    const source = input([row(1), row(2, { queryId: 2, locale: 'fr', provider: 'gemini' }), row(3, { queryId: 3 })])
    source.evidence.queries.push({ id: 3, promptText: 'Inactive?', locale: 'en', active: false })
    const report = buildManagedSiteMonthlyReport(source)
    expect(report.sampleCount).toBe(2); expect(report.byLocale.map(item => item.locale)).toEqual(['en', 'fr'])
    expect(report.byProvider.map(item => item.provider)).toEqual(['chatgpt', 'gemini'])
  })
  it('neutralizes spreadsheet formulas, preserves commas/newlines, and contains no raw evidence', () => {
    const report = buildManagedSiteMonthlyReport(input([row(1, { promptText: '=HYPERLINK("bad"),\nnext' })]))
    const csv = monthlyReportCsv(report)
    expect(csv).toContain('"\'=HYPERLINK(""bad""),\nnext"')
    expect(csv).not.toContain('reviewerNote'); expect(csv).not.toContain('ownerUserId')
    expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/u)
    expect(buildManagedSiteMonthlyReport(input([row(1)])).fingerprint).toBe(buildManagedSiteMonthlyReport(input([row(1)])).fingerprint)
  })
  it.each(['en-US', 'zh-TW', 'ja', 'ko', 'fr-FR', 'de', 'es-MX', 'pt-BR', 'ar', 'hi'])('provides complete fixed report copy for %s', locale => {
    const copy = managedSiteReportCopy(locale)
    expect(Object.values(copy)).toHaveLength(35)
    expect(Object.values(copy).every(value => typeof value === 'string' && value.length > 0)).toBe(true)
    if (locale === 'fr-FR') expect(copy.title).toContain('mensuel')
  })
})
