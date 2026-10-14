import { describe, expect, it, vi } from 'vitest'
import { createInitialPage, finalizePageDocument } from '../server/managed-sites/page-editor/canonical'
import { createMemoryPageEditorRepository } from '../server/managed-sites/page-editor/memory-repository'
import { applyPageCommand, createPagePublicationIntent } from '../server/managed-sites/page-editor/engine'
import { reviewManagedPage } from '../server/managed-sites/page-editor/preflight'
import type { PageActor, PageBlock } from '../server/managed-sites/page-editor/types'

const actor: PageActor = { ownerUserId: 1, projectId: 10, actorUserId: 7, authority: 'customer_session', role: 'customer_admin', canPublish: true }
const now = new Date('2026-10-14T00:00:00Z')
const hero: PageBlock = { blockId: 'hero_00001', type: 'hero', visible: true, layoutVariant: 'centered', data: { title: 'Atelier', description: 'Independent design studio', alignment: 'center', primaryLink: { label: 'Contact', href: '/contact' } }, mediaBindingIds: [], schedule: null }
async function fixture(blocks = [hero]) {
  const repository = createMemoryPageEditorRepository()
  const page = createInitialPage(actor, { pageId: 'page_home_01', locale: 'fr', route: '/', contentType: 'home', designThemeId: 'default', designTokenVersion: 'tokens-v1', designTokens: { palette: 'forest_mist', typeScale: 'editorial', spacing: 'airy', radius: 'soft', maxWidth: 'standard', contrast: 'aa' }, sections: blocks, seo: { title: 'Atelier', description: 'Independent design studio', canonicalPath: '/', noindex: false, ogBindingId: null }, mediaBindings: [] }, now)
  await repository.insertInitial(1, 10, page)
  return { repository, page, review: (version = 1) => reviewManagedPage({ repository, actor, pageId: page.pageId, expectedPageVersion: version, resolveMedia: async () => null, now }) }
}
describe('page review uses authoritative drafts and publication checks', () => {
  it('returns honest technical checks without predicting citations or writing anything', async () => {
    const f = await fixture(), append = vi.spyOn(f.repository, 'appendPublicationReceipt'), enqueue = vi.spyOn(f.repository, 'enqueuePublication')
    const report = await f.review()
    expect(report.technicalStatus).toBe('passed'); expect(report.comparison).toBeNull()
    expect(report.locale).toBe('fr'); expect(report.pageFingerprint).toBe(f.page.fingerprint)
    expect(report.unverified).toContain('browser_mobile_desktop'); expect(report.unverified).toContain('business_fact_accuracy')
    expect(report).not.toHaveProperty('score'); expect(report).not.toHaveProperty('predictedCitationProbability')
    expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/u)
    expect(append).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled()
  })
  it('compares exact saved versions and preserves unrelated content', async () => {
    const f = await fixture()
    await applyPageCommand(f.repository, actor, f.page.pageId, { schemaVersion: 'managed-site-page-command-v1', type: 'update_text', expectedPageVersion: 1, idempotencyKey: 'review-edit-0001', target: { blockId: hero.blockId, path: 'data.title' }, payload: 'Nouvel Atelier', reason: 'Customer title update' }, now)
    const report = await f.review(2)
    expect(report.comparison).toMatchObject({ fromVersion: 1, toVersion: 2, beforeFingerprint: f.page.fingerprint, seoChanged: false, designChanged: false })
    expect(report.comparison?.changes).toHaveLength(1)
    expect(report.comparison?.changes[0]).toMatchObject({ blockId: hero.blockId, kind: 'updated' })
    expect(report.comparison?.changes[0]?.before).toContain('Atelier\nIndependent')
    expect(report.comparison?.changes[0]?.after).toContain('Nouvel Atelier\nIndependent')
    expect((await f.repository.findVersion(1, 10, f.page.pageId, 1))?.fingerprint).toBe(f.page.fingerprint)
  })
  it('blocks incomplete contact forms at real publication entry, not just the UI', async () => {
    const f = await fixture([hero, { blockId: 'contact_0001', type: 'contact', visible: true, layoutVariant: 'form', data: { title: 'Contact', fields: ['email'], consentRequired: true }, mediaBindingIds: [], schedule: null }])
    const enqueue = vi.spyOn(f.repository, 'enqueuePublication')
    expect((await f.review()).findings).toContainEqual({ code: 'contact_fields_missing', severity: 'blocking', blockId: 'contact_0001' })
    await expect(createPagePublicationIntent({ repository: f.repository, actor, pageId: f.page.pageId, expectedPageVersion: 1, resolveMedia: async () => null, releaseReference: 'release:10', publicationTargetReferences: ['target:100'], clientId: 20, idempotencyKey: 'review-publish-01', now })).rejects.toMatchObject({ statusCode: 409, data: { code: 'PAGE_PREFLIGHT_BLOCKED' } })
    expect(enqueue).not.toHaveBeenCalled()
  })
  it('keeps authorization, stale version, and stale-during-review checks server-owned', async () => {
    const f = await fixture()
    await expect(reviewManagedPage({ repository: f.repository, actor: { ...actor, projectId: 11 }, pageId: f.page.pageId, expectedPageVersion: 1, resolveMedia: async () => null, now })).rejects.toMatchObject({ statusCode: 404 })
    await expect(f.review(2)).rejects.toMatchObject({ statusCode: 409 })
    const find = vi.spyOn(f.repository, 'findCurrent'); find.mockResolvedValueOnce(f.page).mockResolvedValueOnce(finalizePageDocument({ ...f.page, version: 2, parentVersion: 1 }))
    await expect(f.review()).rejects.toMatchObject({ statusCode: 409 })
  })
  it('validates earlier comparison identities and never accepts arbitrary documents', async () => {
    const f = await fixture()
    await expect(reviewManagedPage({ repository: f.repository, actor, pageId: f.page.pageId, expectedPageVersion: 1, compareVersion: 1, resolveMedia: async () => null, now })).rejects.toMatchObject({ statusCode: 422 })
    vi.spyOn(f.repository, 'findCurrent').mockResolvedValue({ ...f.page, fingerprint: 'a'.repeat(64) })
    await expect(f.review()).rejects.toThrow(/fingerprint/u)
  })
  it('does not portray booking inquiries or scheduled content as verified fulfillment', async () => {
    const f = await fixture([{ ...hero, schedule: { visibleFrom: '2026-10-15T00:00:00Z', visibleUntil: null, timezone: 'Asia/Taipei' } }, { blockId: 'booking_0001', type: 'booking_intent', visible: true, layoutVariant: 'form', data: { title: 'Book', serviceKeys: ['design'], collectsPayment: false }, mediaBindingIds: [], schedule: null }])
    expect((await f.review()).findings.map(item => item.code)).toEqual(['booking_is_inquiry', 'scheduled_content'])
  })
})
