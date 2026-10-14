import { describe, expect, it, vi } from 'vitest'
import { createFunnelSession } from '../server/managed-sites/funnel/session-service'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { generateAndStoreStudioProposal, confirmStudioProposal, studioSessionProjection } from '../server/managed-sites/funnel/studio-proposal-service'
import { reviseStudioDesign } from '../server/managed-sites/funnel/studio-design-service'
import { confirmedStudioProposal } from '../server/managed-sites/funnel/studio-state'
import { projectStudioCopy } from '../server/managed-sites/funnel/studio-intelligence'
import { studioModelFetch } from './fixtures/managed-site/studio-model'
import { contrastRatio } from '../utils/managedSitePresentation'
import { studioRequiredModules } from '../utils/managedSiteStudio'
const config = { configured: true as const, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'offline-test', apiKey: 'not-real', providerLabel: 'openai' as const, source: 'llm' as const }
async function fixture() {
  const { repository } = createFunnelSessionMemoryRepository(), created = await createFunnelSession(repository)
  const fetchImpl = vi.fn(studioModelFetch())
  const preview = await generateAndStoreStudioProposal(created.session, { brandName: 'Test brand', brief: 'Public handmade design', language: 'en', siteType: 'brand_blog', goal: 'build_brand', mode: 'ai' }, repository, { providerConfiguration: config, fetchImpl })
  const session = (await repository.findSession(created.sessionId))!
  return { ...created, session, repository, preview, fetchImpl }
}
describe('explicit visual revisions without model use', () => {
  it('maps promised actions to real modules rather than only a decorative CTA', () => {
    expect(studioRequiredModules({ goal: 'increase_inquiries', siteType: 'brand_blog' })).toEqual(['contact_lead_capture'])
    expect(studioRequiredModules({ goal: 'sell_online', siteType: 'brand_blog' })).toEqual(['shopify_commerce'])
    expect(studioRequiredModules({ goal: 'increase_bookings', siteType: 'simple_commerce' })).toEqual(['shopify_commerce', 'google_booking_assisted_integration'])
    expect(studioRequiredModules({ goal: 'build_brand', siteType: 'brand_blog' })).toEqual([])
  })
  it('keeps the requested contact form through proposal and explicit confirmation without a second setup wizard', async () => {
    const f = await fixture()
    const preview = await generateAndStoreStudioProposal(f.session, { brandName: 'Contact brand', brief: 'Visitors can enquire about our services', language: 'en', siteType: 'one_page', goal: 'increase_inquiries', mode: 'ai' }, f.repository, { providerConfiguration: config, fetchImpl: f.fetchImpl })
    expect(preview.designs[0]!.html).toContain('data-section-kind="contact_form"')
    await confirmStudioProposal(f.session, { proposalId: preview.proposalId, preset: 'bloom' }, f.repository)
    expect((f.session.answers as any).modules).toContain('contact_lead_capture')
    const blueprint = confirmedStudioProposal(f.session.id, f.session.answers as any)!.blueprint
    expect(blueprint.selectedModulePlacements).toContainEqual(expect.objectContaining({ moduleKey: 'contact_lead_capture', mode: 'first_party' }))
    expect(blueprint.pages[0]!.sections[0]!.ctaHref).toBe('#module-contact-lead-capture')
    expect(f.fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('changes only the requested visual properties; preserves every copy field and confirmed history', async () => {
    const f = await fixture()
    await confirmStudioProposal(f.session, { proposalId: f.preview.proposalId, preset: 'atelier' }, f.repository)
    const original = structuredClone(confirmedStudioProposal(f.session.id, f.session.answers as any)!)
    const updated = await reviseStudioDesign(f.session, { proposalId: f.preview.proposalId, design: { canvas: '#111111', accent: '#ccbb99', typography: 'sans', motion: 'none' } }, f.repository)
    expect(updated.proposalId).not.toBe(f.preview.proposalId)
    const next = (f.session.answers as any).studio.proposals.find((p: any) => p.id === updated.proposalId)
    expect(projectStudioCopy(next.blueprint)).toEqual(projectStudioCopy(original.blueprint))
    expect(next.blueprint.studioPresentation.chrome).toEqual(original.blueprint.studioPresentation!.chrome)
    expect(next.blueprint.studioPresentation.media).toEqual(original.blueprint.studioPresentation!.media)
    expect(contrastRatio(updated.design!.canvas, updated.design!.ink)).toBeGreaterThanOrEqual(4.5)
    expect(confirmedStudioProposal(f.session.id, f.session.answers as any)!.id).toBe(original.id)
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
    await confirmStudioProposal(f.session, { proposalId: updated.proposalId, preset: 'atelier' }, f.repository)
    expect(confirmedStudioProposal(f.session.id, f.session.answers as any)!.blueprint.studioPresentation!.design.typography).toBe('sans')
  })
  it.each([{ css: 'body{display:none}' }, { canvas: 'url(https://bad.test)' }, { typography: 'external-font' }, { motion: 'execute' }, { tuning: { density: 'arbitrary' } }, { chrome: { consent: 'hidden' } }, {}])('rejects non-allowlisted style changes %j', async design => {
    const f = await fixture(), before = structuredClone(f.session.answers)
    await expect(reviseStudioDesign(f.session, { proposalId: f.preview.proposalId, design }, f.repository)).rejects.toMatchObject({ statusCode: 422 })
    expect(f.session.answers).toEqual(before)
  })
  it('returns identical existing proposal for a no-op; never consumes an AI call', async () => {
    const f = await fixture(), count = (f.session.answers as any).studio.proposals.length
    const same = await reviseStudioDesign(f.session, { proposalId: f.preview.proposalId, design: { motion: f.preview.design!.motion } }, f.repository)
    expect(same.proposalId).toBe(f.preview.proposalId)
    expect((f.session.answers as any).studio.proposals).toHaveLength(count)
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('does not duplicate an exact replay or evict history unnecessarily', async () => {
    const f = await fixture(), clock = () => new Date('2026-10-14T00:00:00Z')
    const first = await reviseStudioDesign(f.session, { proposalId: f.preview.proposalId, design: { motion: 'none' } }, f.repository, clock)
    const replay = await reviseStudioDesign(f.session, { proposalId: f.preview.proposalId, design: { motion: 'none' } }, f.repository, clock)
    expect(replay.proposalId).toBe(first.proposalId)
    expect((f.session.answers as any).studio.proposals.filter((item: any) => item.id === first.proposalId)).toHaveLength(1)
  })
  it('projects the saved conversation language without exposing intake data or replacing the website language', async () => {
    const f = await fixture()
    ;(f.session.answers as any).studioIntake = { version: 'studio-intake-v1', revision: 2, language: 'fr', facts: { language: 'ja' }, messages: ['private brief'] }
    const projected = studioSessionProjection(f.session)
    expect(projected.conversationLanguage).toBe('fr')
    expect(projected.answers).not.toHaveProperty('studioIntake')
    expect(JSON.stringify(projected)).not.toContain('private brief')
    expect(projected.studio?.buildStarted).toBe(false)
    expect(studioSessionProjection({ ...f.session, projectId: 123 }).studio?.buildStarted).toBe(true)
  })
  it('cannot change another application, a frozen release, or overwrite a concurrent save', async () => {
    const f = await fixture(), other = await createFunnelSession(f.repository)
    await expect(reviseStudioDesign(other.session, { proposalId: f.preview.proposalId, design: { motion: 'none' } }, f.repository)).rejects.toMatchObject({ statusCode: 409 })
    await expect(reviseStudioDesign({ ...f.session, projectId: 12 }, { proposalId: f.preview.proposalId, design: { motion: 'none' } }, f.repository)).rejects.toMatchObject({ statusCode: 409 })
    await expect(reviseStudioDesign(f.session, { proposalId: f.preview.proposalId, design: { motion: 'none' } }, { ...f.repository, transitionSession: async () => null })).rejects.toMatchObject({ statusCode: 409 })
  })
})
