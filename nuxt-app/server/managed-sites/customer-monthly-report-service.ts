import { createError } from 'h3'
import { createContentOperationsRepository, type ContentOperationsRepository } from '../content-operations/repository'
import { canonicalizePublicHttps } from '../llm-visibility/guards'
import { listActiveVisibilityProjectsForDomain } from '../llm-visibility/repository'
import { assertPaidManagedSiteProject, assertSiteSpecEntitlement } from './module-authority'
import { getManagedSiteRepository } from './repository'
import type { ManagedSiteRepository } from './types'
import { buildManagedSiteMonthlyReport, monthInTimeZone, monthlyReportWindow } from './monthly-report'
import { readMonthlyVisibilityEvidence, type MonthlyEvidenceReader } from './monthly-report-repository'

export async function getManagedSiteMonthlyReport(ownerUserId: number, projectId: number, month: string | undefined, dependencies: { managed?: ManagedSiteRepository; operations?: ContentOperationsRepository; listProjects?: typeof listActiveVisibilityProjectsForDomain; readEvidence?: MonthlyEvidenceReader; now?: Date } = {}) {
  const authority = await assertPaidManagedSiteProject(ownerUserId, projectId, dependencies.managed || getManagedSiteRepository())
  assertSiteSpecEntitlement(authority.spec, 'geo_measurement_dashboard')
  const clientId = authority.project.contentOperationClientId
  if (clientId === null) return { status: 'not_configured' as const }
  const operations = dependencies.operations || createContentOperationsRepository()
  const client = await operations.findClient(ownerUserId, clientId)
  if (!client || client.ownerUserId !== ownerUserId || client.status !== 'active') return { status: 'not_configured' as const }
  const now = dependencies.now || new Date()
  let window: ReturnType<typeof monthlyReportWindow>
  try { window = monthlyReportWindow(month || monthInTimeZone(now, client.timeZone), client.timeZone, now) } catch { throw createError({ statusCode: 422, statusMessage: 'Invalid report month or website time zone.' }) }
  const domain = canonicalizePublicHttps(client.canonicalSiteOrigin).hostname
  const projects = await (dependencies.listProjects || listActiveVisibilityProjectsForDomain)(ownerUserId, domain)
  if (projects.length === 0) return { status: 'not_configured' as const }
  if (projects.length !== 1 || projects[0]?.canonicalDomain !== domain) throw createError({ statusCode: 409, statusMessage: 'The report must belong to exactly one website.' })
  const evidence = await (dependencies.readEvidence || readMonthlyVisibilityEvidence)(ownerUserId, projects[0].id, domain, window.from, window.until)
  return buildManagedSiteMonthlyReport({ brandName: authority.spec.businessIdentity.brandName, domain, locale: authority.spec.locale, month: window.month, timeZone: client.timeZone, now, evidence })
}
