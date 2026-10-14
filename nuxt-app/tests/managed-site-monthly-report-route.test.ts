import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, createError, defineEventHandler, getHeader, toWebHandler } from 'h3'
import { getManagedSiteMonthlyReport } from '../server/managed-sites/customer-monthly-report-service'
vi.mock('../server/managed-sites/customer-monthly-report-service', () => ({ getManagedSiteMonthlyReport: vi.fn() }))
vi.mock('../server/managed-sites/auth', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  requireManagedSiteCustomer: async (event: any) => {
    if (getHeader(event, 'x-fixture-session') !== 'yes') throw createError({ statusCode: 401, statusMessage: 'Sign in again.' })
    return { project: { ownerUserId: 7, id: 11 }, membership: { role: getHeader(event, 'x-fixture-role') || 'owner' } }
  },
}))
let request: (query?: string, headers?: Record<string, string>) => Promise<Response>
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  const handler = (await import('../server/api/managed-sites/customer/monthly-report.get')).default
  const app = createApp({ debug: false }); app.use(handler)
  request = (query = '', headers = { 'x-fixture-session': 'yes' }) => toWebHandler(app)(new Request(`https://studio.test/api/managed-sites/customer/monthly-report${query}`, { headers }))
})
afterEach(() => { vi.mocked(getManagedSiteMonthlyReport).mockReset() })
describe('actual monthly report route', () => {
  it('derives scope only from the private customer session and applies no-store before auth', async () => {
    const unauthorized = await request('', {})
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('cache-control')).toContain('no-store')
    expect(unauthorized.headers.get('x-robots-tag')).toContain('noindex')
    expect(getManagedSiteMonthlyReport).not.toHaveBeenCalled()
    vi.mocked(getManagedSiteMonthlyReport).mockResolvedValueOnce({ status: 'not_configured' })
    expect((await request('?month=2026-09')).status).toBe(200)
    expect(getManagedSiteMonthlyReport).toHaveBeenCalledWith(7, 11, '2026-09')
  })
  it.each(['?ownerUserId=9', '?domain=other.site', '?month=2026-09&month=2026-10', '?month[]=2026-09', '?month=2026-13'])('rejects caller-supplied authority or malformed calendar input %s', async query => {
    expect((await request(query)).status).toBe(422); expect(getManagedSiteMonthlyReport).not.toHaveBeenCalled()
  })
  it('denies unauthorized roles and redacts storage/provider diagnostics', async () => {
    expect((await request('', { 'x-fixture-session': 'yes', 'x-fixture-role': 'unknown' })).status).toBe(403)
    vi.mocked(getManagedSiteMonthlyReport).mockRejectedValueOnce(new Error('secret-database-connection'))
    const response = await request()
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret-database-connection')
  })
})
