import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as utility from '../utils/managedSiteStudio'

const source = readFileSync(new URL('../components/ManagedSiteDesignStudio.vue', import.meta.url), 'utf8')
const sample: utility.StudioPreview = { source: 'template', sourceReason: '沒有呼叫 AI', generatedAt: '2026-10-12T00:00:00Z', headline: '首頁', sections: [], designs: ['atelier', 'bloom', 'alignment'].map(preset => ({ preset: preset as utility.StudioPreset, html: `<html>${preset}</html>` })) }
sample.editContext = { schemaVersion: 'managed-site-preview-copy-v1', navigation: [{ route: '/', label: '首頁' }], pages: [{ pageKey: 'home', title: '首頁', description: '原本簡介' }], sections: [], faq: [], summaryAnswer: '原本摘要' }
sample.pages = [{ key: 'home', label: '首頁', designs: sample.designs }, { key: 'about', label: '品牌故事', designs: sample.designs.map(design => ({ ...design, html: '<html>About</html>' })) }]
const edited: utility.StudioPreview = { ...structuredClone(sample), source: 'llm', headline: '新標題', changes: [{ key: 'page:home:title', label: '首頁', before: '首頁', after: '新標題' }] }
function harness(requestPreview = vi.fn(async (_input: any) => structuredClone(sample)), initial?: utility.StudioBrief, draft?: utility.StudioSelection) {
  const props = { requestPreview, saving: false, initial, draft, saveError: '', confirmed: null as null | { proposalId: string; preset: utility.StudioPreset } }
  const emit = vi.fn()
  let unmount = () => {}
  const vue = { ref: (value: unknown) => ({ value }), computed: (getter: () => unknown) => ({ get value() { return getter() } }), nextTick: () => Promise.resolve() }
  const script = ts.transpileModule(`${source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/u)![1]}\nexport { brief, result, busy, dirty, revision, history, canContinue, selectedPreset, generate, undo, continueWithDesign, useExample, examples, proposeRevision, applyRevision, discardRevision, pending, visibleResult, previewView, currentPage, selectedDesign, canApply, error, notice, showingConfirmed };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', 'defineProps', 'defineEmits', script)((name: string) => name === 'vue' ? { ...vue, onBeforeUnmount: (callback: () => void) => { unmount = callback } } : utility, module, module.exports, () => props, () => emit)
  const page = module.exports
  if (!initial) page.brief.value = { brandName: 'Studio test', brief: '我的服務', siteType: 'brand_blog', goal: 'increase_inquiries' }
  return { page, props, emit, requestPreview, unmount: () => unmount() }
}

describe('real design studio script behavior', () => {
  it('only labels the exact server-confirmed version and preset as confirmed', async () => {
    const { page, props } = harness()
    await page.generate()
    page.result.value = { ...sample, proposalId: 'a'.repeat(64) }
    props.confirmed = { proposalId: 'a'.repeat(64), preset: 'atelier' }
    expect(page.showingConfirmed.value).toBe(true)
    page.selectedPreset.value = 'bloom'
    expect(page.showingConfirmed.value).toBe(false)
    page.selectedPreset.value = 'atelier'
    page.revision.value = '新修改仍待確認'
    expect(page.showingConfirmed.value).toBe(false)
    page.revision.value = ''
    page.pending.value = { preview: edited, instruction: '修改', briefKey: '' }
    expect(page.showingConfirmed.value).toBe(false)
    page.pending.value = null
    props.confirmed.proposalId = 'b'.repeat(64)
    expect(page.showingConfirmed.value).toBe(false)
    expect(source).toContain('完整版本已確認')
  })
  it('restores a matching in-tab proposal without regenerating, but never restores stale content for a different brief', () => {
    const brief = { brandName: 'Studio test', brief: '我的服務', siteType: 'brand_blog', goal: 'increase_inquiries' } as const
    const draft = { brief, preset: 'bloom', preview: sample } as const
    const restored = harness(undefined, brief, draft)
    expect(restored.page.result.value).toEqual(sample)
    expect(restored.page.selectedPreset.value).toBe('bloom')
    expect(restored.page.canContinue.value).toBe(true)
    expect(restored.requestPreview).not.toHaveBeenCalled()
    const changed = harness(undefined, { ...brief, brief: '改做別的服務' }, draft)
    expect(changed.page.result.value).toBeNull()
    expect(changed.page.canContinue.value).toBe(false)
  })
  it('starts template-only, switches designs without requests, and emits the chosen real preset', async () => {
    const { page, requestPreview, emit } = harness()
    await page.generate()
    expect(requestPreview).toHaveBeenCalledWith(expect.objectContaining({ mode: 'template' }))
    page.selectedPreset.value = 'bloom'
    expect(page.canContinue.value).toBe(true)
    page.continueWithDesign()
    expect(emit).toHaveBeenCalledWith('continue', expect.objectContaining({ preset: 'bloom' }))
    expect(requestPreview).toHaveBeenCalledTimes(1)
  })
  it('blocks stale adoption and restores the last version with its matching brief', async () => {
    const { page, requestPreview } = harness()
    await page.generate()
    page.revision.value = '更親切'
    expect(page.canContinue.value).toBe(false)
    requestPreview.mockResolvedValueOnce(edited)
    await page.proposeRevision()
    expect(requestPreview).toHaveBeenLastCalledWith(expect.objectContaining({ brief: '我的服務', revision: { instruction: '更親切', base: sample.editContext } }))
    expect(page.result.value.headline).toBe('首頁')
    expect(page.pending.value.preview.headline).toBe('新標題')
    expect(page.canContinue.value).toBe(false)
    page.previewView.value = 'before'
    expect(page.visibleResult.value.headline).toBe('首頁')
    page.applyRevision()
    expect(page.result.value.headline).toBe('新標題')
    expect(page.brief.value.brief).toBe('我的服務')
    page.undo()
    expect(page.result.value.headline).toBe('首頁')
    expect(page.brief.value.brief).toBe('我的服務')
    expect(page.canContinue.value).toBe(true)
    page.brief.value.brandName = 'Changed'
    expect(page.canContinue.value).toBe(false)
  })
  it('retains old preview and text after failure; prevents duplicate in-flight requests', async () => {
    const { page, requestPreview } = harness()
    await page.generate()
    const before = page.result.value
    requestPreview.mockRejectedValueOnce(new Error('offline'))
    page.revision.value = '待保留要求'
    await page.proposeRevision()
    expect(page.result.value).toEqual(before)
    expect(page.revision.value).toBe('待保留要求')
    let finish!: (value: any) => void
    requestPreview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = page.proposeRevision()
    await page.proposeRevision()
    expect(requestPreview).toHaveBeenCalledTimes(3)
    finish(edited); await pending
  })
  it('rejects invalid input, does not overwrite filled input with examples, ignores unmounted responses', async () => {
    const { page, requestPreview, unmount } = harness()
    page.useExample(page.examples[0])
    expect(page.brief.value.brandName).toBe('Studio test')
    page.brief.value.brief = 'x'.repeat(1801)
    await page.generate()
    expect(requestPreview).not.toHaveBeenCalled()
    page.brief.value.brief = 'Valid'
    let finish!: (value: any) => void
    requestPreview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = page.generate(); unmount(); finish(sample); await pending
    expect(page.result.value).toBeNull()
  })
  it('keeps markup accessible, sandboxed, no storage, no arbitrary provider requests', () => {
    expect(source).toContain('sandbox=""')
    expect(source).toContain('referrerpolicy="no-referrer"')
    expect(source).toContain(':aria-pressed="selectedPreset === direction.key"')
    expect(source).toContain('role="alert"')
    expect(source).not.toMatch(/v-html|allow-scripts|allow-same-origin|localStorage|sessionStorage|fetch\(/u)
  })
  it('switches real pages without provider calls and can discard a proposal without losing the original', async () => {
    const { page, requestPreview } = harness()
    await page.generate()
    page.currentPage.value = 'about'
    expect(page.selectedDesign.value.html).toContain('About')
    expect(requestPreview).toHaveBeenCalledTimes(1)
    page.revision.value = '換個標題'
    requestPreview.mockResolvedValueOnce(edited)
    await page.proposeRevision()
    page.discardRevision()
    expect(page.pending.value).toBeNull()
    expect(page.result.value.headline).toBe('首頁')
    expect(page.revision.value).toBe('換個標題')
    expect(page.history.value).toEqual([])
  })
  it('rejects fallback/no-op edits, stale proposals, partial pages, and late edit responses', async () => {
    const { page, requestPreview, unmount } = harness()
    await page.generate()
    page.revision.value = '換個標題'
    await page.proposeRevision() // a template response is never an accepted AI edit
    expect(page.pending.value).toBeNull()
    requestPreview.mockResolvedValueOnce({ ...edited, changes: [] })
    await page.proposeRevision()
    expect(page.notice.value).toContain('沒有產生文字差異')
    requestPreview.mockResolvedValueOnce(edited)
    await page.proposeRevision()
    page.brief.value.brandName = 'Changed during proposal'
    expect(page.canApply.value).toBe(false)
    page.applyRevision()
    expect(page.result.value.headline).toBe('首頁')
    page.brief.value.brandName = 'Studio test'
    page.discardRevision()
    requestPreview.mockResolvedValueOnce({ ...edited, pages: [{ key: 'home', label: '首頁', designs: [] }] })
    await page.proposeRevision()
    expect(page.pending.value).toBeNull()
    let finish!: (value: any) => void
    requestPreview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pendingRequest = page.proposeRevision(); unmount(); finish(edited); await pendingRequest
    expect(page.pending.value).toBeNull()
    expect(page.result.value.headline).toBe('首頁')
  })
})
