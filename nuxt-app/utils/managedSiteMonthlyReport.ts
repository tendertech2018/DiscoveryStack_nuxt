export type MonthlyOutcome = 'cited' | 'mentioned_without_citation' | 'not_mentioned'
export type MonthlyEstimate = { rate: number; n: number; confidenceInterval: { level: 0.95; lower: number; upper: number }; standardError: number } | null
export type ManagedSiteMonthlyReport = {
  schemaVersion: 'managed-site-monthly-report-v1'
  status: 'ready' | 'insufficient_data'
  brandName: string
  domain: string
  locale: string
  month: string
  timeZone: string
  asOf: string
  periodComplete: boolean
  evidenceBasis: 'currently_approved_manual_observations'
  trackedQueries: number
  observedQueries: number
  sampleCount: number
  labels: Record<MonthlyOutcome, number>
  estimates: { mention: MonthlyEstimate; citation: MonthlyEstimate }
  byProvider: Array<{ provider: string; sampleCount: number; mentioned: number; cited: number }>
  byLocale: Array<{ locale: string; sampleCount: number; mentioned: number; cited: number }>
  questions: Array<{ question: string; locale: string; sampleCount: number; cited: number; mentioned: number; action: 'observe' | 'improve_sources' | 'maintain' }>
  entityAccuracy: null
  attributedVisits: null
  attributedConversions: null
  limitations: string[]
  fingerprint: string
}

/** Spreadsheet formula protection applies to every exported cell, including prompts. */
export function monthlyReportCsv(report: ManagedSiteMonthlyReport): string {
  const cell = (value: string | number) => {
    const text = String(value)
    return `"${(/^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text).replace(/"/gu, '""')}"`
  }
  const rows: Array<Array<string | number>> = [
    ['month', 'time_zone', 'question', 'locale', 'reviewed_samples', 'brand_mentions', 'site_citations', 'next_action'],
    ...report.questions.map(item => [report.month, report.timeZone, item.question, item.locale, item.sampleCount, item.mentioned, item.cited, item.action]),
  ]
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
