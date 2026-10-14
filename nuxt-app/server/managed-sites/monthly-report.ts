import { createError } from 'h3'
import { createHash } from 'node:crypto'
import { citationMatchesDomain } from '../llm-visibility/guards'
import { proportionEstimate } from '../llm-visibility/statistics'
import type { ManagedSiteMonthlyReport, MonthlyOutcome } from '../../utils/managedSiteMonthlyReport'

export type MonthlyQuery = { id: number; promptText: string; locale: string; active: boolean }
export type MonthlyObservation = { id: number; queryId: number; promptText: string | null; locale: string; provider: string; observedAt: Date | string; observationMode: string; brandMentioned: boolean; citationUrls: string[]; reviewStatus: 'approved' | 'pending' | 'revoked' }
export type MonthlyEvidence = { queries: MonthlyQuery[]; observations: MonthlyObservation[] }

export function monthInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date)
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`
}

export function monthlyReportWindow(month: string, timeZone: string, now = new Date()) {
  if (!/^(?:20\d\d)-(?:0[1-9]|1[0-2])$/u.test(month) || !Number.isFinite(now.getTime())) throw createError({ statusCode: 422, statusMessage: 'Invalid report month.' })
  let currentMonth: string
  try { currentMonth = monthInTimeZone(now, timeZone) } catch { throw createError({ statusCode: 422, statusMessage: 'Invalid report time zone.' }) }
  if (month > currentMonth) throw createError({ statusCode: 422, statusMessage: 'A future month has no completed observations.' })
  const [year, number] = month.split('-').map(Number)
  // Broad SQL window includes every IANA offset. The projector applies the exact
  // local calendar month, including DST, and excludes future observations.
  return { month, timeZone, now, periodComplete: month < currentMonth, from: new Date(Date.UTC(year!, number! - 1, 1) - 36 * 3_600_000), until: new Date(Math.min(now.getTime(), Date.UTC(year!, number!, 1) + 36 * 3_600_000)) }
}

export function buildManagedSiteMonthlyReport(input: { brandName: string; domain: string; locale: string; month: string; timeZone: string; now: Date; evidence: MonthlyEvidence }): ManagedSiteMonthlyReport {
  const window = monthlyReportWindow(input.month, input.timeZone, input.now)
  if (input.evidence.queries.length > 500 || input.evidence.observations.length > 2000) throw createError({ statusCode: 409, statusMessage: 'Report exceeds its complete-read limit.' })
  const queries = input.evidence.queries.filter(query => query.active)
  const queryMap = new Map(queries.map(query => [query.id, query]))
  if (new Set(input.evidence.queries.map(query => query.id)).size !== input.evidence.queries.length || new Set(input.evidence.observations.map(row => row.id)).size !== input.evidence.observations.length) throw createError({ statusCode: 409, statusMessage: 'Duplicate report evidence.' })
  const labels: Record<MonthlyOutcome, number> = { cited: 0, mentioned_without_citation: 0, not_mentioned: 0 }
  const groups = { provider: new Map<string, { sampleCount: number; mentioned: number; cited: number }>(), locale: new Map<string, { sampleCount: number; mentioned: number; cited: number }>() }
  const questionGroups = new Map<string, { question: string; locale: string; sampleCount: number; cited: number; mentioned: number }>()
  const observedIds = new Set<number>()
  let samples = 0, mentioned = 0, cited = 0, unversioned = false
  for (const row of input.evidence.observations) {
    if (row.reviewStatus !== 'approved' || row.observationMode !== 'manual_verified' || !queryMap.has(row.queryId)) continue
    const observedAt = new Date(row.observedAt)
    if (!Number.isFinite(observedAt.getTime())) throw createError({ statusCode: 409, statusMessage: 'Invalid observation time.' })
    if (observedAt >= input.now || monthInTimeZone(observedAt, input.timeZone) !== input.month) continue
    if (!Array.isArray(row.citationUrls) || row.citationUrls.length > 50 || typeof row.brandMentioned !== 'boolean') throw createError({ statusCode: 409, statusMessage: 'Invalid observation evidence.' })
    const hasCitation = row.citationUrls.some(url => citationMatchesDomain(url, input.domain))
    const hasMention = row.brandMentioned
    const label: MonthlyOutcome = hasCitation ? 'cited' : hasMention ? 'mentioned_without_citation' : 'not_mentioned'
    labels[label]++; samples++; mentioned += Number(hasMention); cited += Number(hasCitation); observedIds.add(row.queryId)
    // Never relabel an old observation with a subsequently edited prompt.
    const question = row.promptText || '[Historical question text unavailable]'
    if (!row.promptText) unversioned = true
    const key = JSON.stringify([row.queryId, question, row.locale])
    const questionGroup = questionGroups.get(key) || { question, locale: row.locale, sampleCount: 0, cited: 0, mentioned: 0 }
    questionGroup.sampleCount++; questionGroup.cited += Number(hasCitation); questionGroup.mentioned += Number(hasMention); questionGroups.set(key, questionGroup)
    for (const [collection, identity] of [[groups.provider, row.provider], [groups.locale, row.locale]] as const) {
      const group = collection.get(identity) || { sampleCount: 0, mentioned: 0, cited: 0 }
      group.sampleCount++; group.mentioned += Number(hasMention); group.cited += Number(hasCitation); collection.set(identity, group)
    }
  }
  for (const query of queries) if (!observedIds.has(query.id)) questionGroups.set(`unobserved:${query.id}`, { question: query.promptText, locale: query.locale, sampleCount: 0, cited: 0, mentioned: 0 })
  const questions = [...questionGroups.values()].map(row => ({ ...row, action: row.sampleCount === 0 ? 'observe' as const : row.cited === 0 ? 'improve_sources' as const : 'maintain' as const }))
    .sort((a, b) => a.sampleCount - b.sampleCount || a.cited - b.cited || (a.question < b.question ? -1 : a.question > b.question ? 1 : 0))
  const report = {
    schemaVersion: 'managed-site-monthly-report-v1' as const, status: samples ? 'ready' as const : 'insufficient_data' as const,
    brandName: input.brandName, domain: input.domain, locale: input.locale, month: input.month, timeZone: input.timeZone,
    asOf: input.now.toISOString(), periodComplete: window.periodComplete, evidenceBasis: 'currently_approved_manual_observations' as const,
    trackedQueries: queries.length, observedQueries: observedIds.size, sampleCount: samples, labels,
    estimates: { mention: proportionEstimate(mentioned, samples), citation: proportionEstimate(cited, samples) },
    byProvider: [...groups.provider].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([provider, value]) => ({ provider, ...value })),
    byLocale: [...groups.locale].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([locale, value]) => ({ locale, ...value })), questions,
    entityAccuracy: null, attributedVisits: null, attributedConversions: null,
    limitations: ['observational_not_causal', 'manual_reviewed_samples_not_population', 'active_query_set_as_of_report', 'current_review_status_not_historical_approval', 'entity_accuracy_not_measured', 'conversion_attribution_not_established', 'question_gaps_not_search_volume', ...(samples === 0 ? ['insufficient_sample'] : samples === 1 ? ['single_sample_not_trend'] : []), ...(unversioned ? ['historical_prompt_text_unavailable'] : []), ...(!window.periodComplete ? ['month_in_progress'] : [])],
  }
  return { ...report, fingerprint: createHash('sha256').update(JSON.stringify(report)).digest('hex') }
}
