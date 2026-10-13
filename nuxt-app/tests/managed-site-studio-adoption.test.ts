import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as wizard from '../utils/managedSiteFunnel'
import * as studio from '../utils/managedSiteStudio'

const source = readFileSync(new URL('../pages/customer/managed-sites/start.vue', import.meta.url), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/u)![1]!
const selection: studio.StudioSelection = { brief: { brandName: '我的品牌', brief: '提供顧問服務', siteType: 'simple_commerce', goal: 'sell_online' }, preset: 'bloom', preview: { proposalId: 'a'.repeat(64), source: 'template', sourceReason: 'template', generatedAt: new Date().toISOString(), headline: '首頁', sections: [{ heading: '介紹', body: 'x'.repeat(2200) }], designs: [{ preset: 'bloom', html: '<html>preview only</html>' }] } }
function harness(fail = false) {
  const fetch = vi.fn(async (_url: string, options: any) => {
    if (fail) throw new Error('offline')
    return { status: 'active', currentStep: 2, answers: { ...studio.studioAnswers(selection.brief, selection.preset), existingSite: { hasSite: false } }, studio: { confirmed: true, hasProposal: true, proposalId: selection.preview.proposalId }, consentSnapshot: null, domainAvailability: null, domainRegistration: null, previewUrl: null, contactInbox: { status: 'unbound', maskedEmail: null, resendAvailableAt: null, transportConfigured: false } }
  })
  const vue = { ref: (value: unknown) => ({ value }), computed: (definition: any) => ({ get value() { return typeof definition === 'function' ? definition() : definition.get() }, set value(value: unknown) { definition.set(value) } }), onMounted: vi.fn(), onBeforeUnmount: vi.fn() }
  const script = ts.transpileModule(`${source}\nexport { answers, sessionProjection, currentStep, sessionId, sessionToken, showDesignStudio, saveStatus, adoptStudioDesign, openDetailedStudioFlow, studioDraft };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', '$fetch', 'useHead', 'useRuntimeConfig', script)((name: string) => name === 'vue' ? vue : name.endsWith('managedSiteStudio') ? studio : wizard, module, module.exports, fetch, vi.fn(), () => ({ public: {} }))
  const page = module.exports
  page.sessionProjection.value = { status: 'active' }; page.sessionId.value = 17; page.sessionToken.value = 'fixture-capability-only'
  return { page, fetch }
}

describe('studio to the real customer wizard', () => {
  it('preserves typed brand details when choosing the existing-site or detailed route', () => {
    const { page, fetch } = harness()
    page.openDetailedStudioFlow(selection.brief)
    expect(page.answers.value.company).toMatchObject({ brandName: '我的品牌', whatWeDo: '提供顧問服務' })
    expect(page.answers.value.siteType).toBe('simple_commerce')
    expect(page.currentStep.value).toBe(1)
    expect(page.showDesignStudio.value).toBe(false)
    expect(page.studioDraft.value).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('confirms only the server proposal identity and preset, then asks for real contact', async () => {
    const { page, fetch } = harness()
    await page.adoptStudioDesign(selection)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = fetch.mock.calls[0]!
    expect(url).toBe('/api/managed-sites/funnel/sessions/17/studio-confirm')
    expect(options.credentials).toBe('omit')
    expect(options.headers).toEqual({ 'x-managed-site-funnel-token': 'fixture-capability-only' })
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({ proposalId: selection.preview.proposalId, preset: 'bloom' })
    expect(options.body).not.toHaveProperty('consent')
    expect(JSON.stringify(options.body)).not.toContain('<html>')
    expect(page.currentStep.value).toBe(2)
    expect(page.showDesignStudio.value).toBe(false)
    expect(page.studioDraft.value).toEqual(selection)
  })
  it('does not overwrite an existing-site diagnosis, custom references or module choices', async () => {
    const { page, fetch } = harness()
    page.answers.value.existingSite = { hasSite: true, url: 'https://brand.test', snapshot: { snapshotFingerprint: 'existing server evidence' } }
    page.answers.value.modules = ['contact_lead_capture']
    page.answers.value.style = { referenceUrls: ['https://reference.test'], designTier: 'designer' }
    await page.adoptStudioDesign(selection)
    const patch = fetch.mock.calls[0]![1].body
    expect(patch).toEqual({ proposalId: selection.preview.proposalId, preset: 'bloom' })
    // Saved choices are merged on the server, never re-authorized by this browser payload.
  })
  it('retains the studio on save failure and cannot mutate a locked order', async () => {
    const { page, fetch } = harness(true)
    await page.adoptStudioDesign(selection)
    expect(page.saveStatus.value).toBe('error')
    expect(page.showDesignStudio.value).toBe(true)
    expect(page.studioDraft.value).toBeNull()
    page.sessionProjection.value.status = 'building'
    await page.adoptStudioDesign(selection)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
