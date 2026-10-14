import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, createError, createRouter, defineEventHandler, getHeader, toWebHandler } from 'h3'
import { reviewManagedPage } from '../server/managed-sites/page-editor/preflight'
vi.mock('../server/managed-sites/page-editor/preflight', () => ({ reviewManagedPage: vi.fn() }))
vi.mock('../server/managed-sites/page-editor/repository-drizzle', () => ({ getDrizzlePageEditorRepository: () => ({}) }))
vi.mock('../server/managed-sites/media-vault/repository-drizzle', () => ({ getDrizzleMediaVaultRepository: () => ({ findAsset: vi.fn() }) }))
vi.mock('../server/managed-sites/auth', () => ({ requireManagedSiteCustomer: async (event: any) => {
  if (!getHeader(event, 'x-fixture-session')) throw createError({ statusCode: 401 })
  return { project: { id: 11, ownerUserId: 7, status: 'active' }, membership: { userId: 9, role: 'reviewer' } }
} }))
let request: (body: unknown, headers?: Record<string, string>) => Promise<Response>
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  const handler = (await import('../server/api/managed-sites/editor/pages/[pageId]/preflight.post')).default
  const router = createRouter(); router.post('/api/managed-sites/editor/pages/:pageId/preflight', handler)
  const app = createApp({ debug: false }); app.use(router)
  request = (body, headers = {}) => toWebHandler(app)(new Request('https://studio.test/api/managed-sites/editor/pages/page_home_01/preflight', { method: 'POST', headers: { 'content-type': 'application/json', host: 'studio.test', 'x-forwarded-proto': 'https', origin: 'https://studio.test', 'x-fixture-session': 'yes', ...headers }, body: JSON.stringify(body) }))
})
afterEach(() => { vi.mocked(reviewManagedPage).mockReset() })
describe('actual preflight private route', () => {
  it('requires same-origin and customer access, including private headers on failures', async () => {
    const cross = await request({ expectedPageVersion: 2 }, { origin: 'https://other.test' })
    expect(cross.status).toBe(403); expect(cross.headers.get('cache-control')).toContain('no-store')
    expect((await request({ expectedPageVersion: 2 }, { 'x-fixture-session': '' })).status).toBe(401)
    expect(reviewManagedPage).not.toHaveBeenCalled()
  })
  it.each([{ expectedPageVersion: 0 }, { expectedPageVersion: 2, ownerUserId: 8 }, { expectedPageVersion: 2, document: {} }, { expectedPageVersion: '2' }, { expectedPageVersion: 2, compareVersion: 0 }])('rejects injected authority, arbitrary documents and invalid versions %#', async body => {
    expect((await request(body)).status).toBe(422); expect(reviewManagedPage).not.toHaveBeenCalled()
  })
  it('allows read-only reviewers, binds server scope, and sanitizes unexpected errors', async () => {
    vi.mocked(reviewManagedPage).mockResolvedValueOnce({ technicalStatus: 'passed' } as any)
    expect((await request({ expectedPageVersion: 2, compareVersion: 1 })).status).toBe(200)
    expect(reviewManagedPage).toHaveBeenCalledWith(expect.objectContaining({ actor: { ownerUserId: 7, projectId: 11, actorUserId: 9, authority: 'customer_session', role: 'viewer', canPublish: false }, pageId: 'page_home_01', expectedPageVersion: 2, compareVersion: 1 }))
    vi.mocked(reviewManagedPage).mockRejectedValueOnce(new Error('secret-storage-diagnostic'))
    const failed = await request({ expectedPageVersion: 2 })
    expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('secret-storage-diagnostic')
  })
})
