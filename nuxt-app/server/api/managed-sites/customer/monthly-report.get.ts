import { createError, getQuery, setResponseHeader } from 'h3'
import { requireManagedSiteCustomer, requireManagedSiteCustomerPermission } from '../../../managed-sites/auth'
import { getManagedSiteMonthlyReport } from '../../../managed-sites/customer-monthly-report-service'

export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  const access = requireManagedSiteCustomerPermission(await requireManagedSiteCustomer(event), 'content:read')
  const query = getQuery(event)
  if (Object.keys(query).some(key => key !== 'month') || query.month !== undefined && (typeof query.month !== 'string' || !/^20\d\d-(?:0[1-9]|1[0-2])$/u.test(query.month))) throw createError({ statusCode: 422, statusMessage: 'Only a calendar month is accepted.' })
  try { return await getManagedSiteMonthlyReport(access.project.ownerUserId, access.project.id, query.month as string | undefined) }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && [401, 403, 404, 409, 422].includes(Number(error.statusCode))) throw error
    throw createError({ statusCode: 503, statusMessage: 'Monthly reporting is temporarily unavailable.' })
  }
})
