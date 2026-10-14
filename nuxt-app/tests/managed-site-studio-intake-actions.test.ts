import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as guided from '../utils/managedSiteGuided'
import * as language from '../utils/managedSiteLanguage'
import { DEFAULT_STUDIO_DESIGN } from '../utils/managedSitePresentation'
const source = readFileSync(new URL('../components/StudioGuidedIntake.vue', import.meta.url), 'utf8')
const ready = (revision = 1): guided.StudioIntakeReply => ({ revision, language: 'fr', status: 'ready', reply: 'Prêt', providerUsed: false, facts: { brandName: 'ÉCLAT' }, questions: [], brief: { brandName: 'ÉCLAT', brief: 'Bijoux', audience: 'Clients en France', language: 'fr', goal: 'build_brand', siteType: 'brand_blog', guidedRevision: revision } })
const reference = { version: 'studio-reference-v1' as const, url: 'https://style.acme.taipei/', analysedAt: '2026-10-14T00:00:00Z', status: 'analysed' as const, palette: ['#f4f0e9'], fonts: [], signals: { imageCount: 1, sectionCount: 1, hasGrid: true, hasSticky: false, hasCssAnimation: false }, design: DEFAULT_STUDIO_DESIGN, limitations: [] }
function harness() {
  const props = { request: vi.fn(async () => ready()), analyseReference: vi.fn(async () => ({ ...ready(2), reference })), disabled: false }
  const emit = vi.fn()
  let unmount = () => {}
  const vue = { ref: (value: unknown) => ({ value }), computed: (fn: () => unknown) => ({ get value() { return fn() } }), onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn } }
  const script = ts.transpileModule(source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/u)![1] + '\nexport { state, message, referenceUrl, answers, busy, error, submit, generateReady };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', 'defineProps', 'defineEmits', script)((name: string) => name === 'vue' ? vue : name.includes('managedSiteGuided') ? guided : language, module, module.exports, () => props, () => emit)
  return { page: module.exports, props, emit, unmount: () => unmount() }
}
describe('one create action includes reference, without duplicate questions or silent AI calls', () => {
  it('saves intake then analyses the pasted URL against its latest revision before emitting generate', async () => {
    const f = harness()
    f.page.message.value = 'ÉCLAT, bijoux pour femmes en France.'
    f.page.referenceUrl.value = reference.url
    await f.page.submit(true)
    expect(f.props.request).toHaveBeenCalledTimes(1)
    expect(f.props.analyseReference).toHaveBeenCalledWith(reference.url, 1)
    expect(f.emit).toHaveBeenCalledWith('ready', expect.objectContaining({ guidedRevision: 2 }))
    expect(f.emit).toHaveBeenCalledWith('generate', 'ai')
    expect(f.page.state.value.revision).toBe(2)
    expect(f.props.request.mock.invocationCallOrder[0]).toBeLessThan(f.props.analyseReference.mock.invocationCallOrder[0]!)
  })
  it('keeps known details and never repeats the reference fetch on a later generation', async () => {
    const f = harness(); f.page.state.value = ready(); f.page.referenceUrl.value = reference.url
    await f.page.generateReady('template')
    await f.page.generateReady('ai')
    expect(f.props.request).not.toHaveBeenCalled()
    expect(f.props.analyseReference).toHaveBeenCalledTimes(1)
    expect(f.emit).toHaveBeenCalledWith('generate', 'template')
    expect(f.emit).toHaveBeenCalledWith('generate', 'ai')
  })
  it('does not skip a failed reference and call a model anyway; preserves the saved intake for retry', async () => {
    const f = harness(); f.page.message.value = 'Public brand'; f.page.referenceUrl.value = reference.url
    f.props.analyseReference.mockRejectedValueOnce(new Error('unavailable'))
    await f.page.submit(true)
    expect(f.page.state.value.revision).toBe(1)
    expect(f.page.error.value).toBeTruthy()
    expect(f.emit.mock.calls.filter(call => call[0] === 'generate')).toEqual([])
    await f.page.generateReady('ai')
    expect(f.props.request).toHaveBeenCalledTimes(1)
    expect(f.emit).toHaveBeenCalledWith('generate', 'ai')
  })
  it('preserves missing-question and off-topic states without generating or fetching off-topic URLs', async () => {
    const f = harness(); f.page.message.value = 'A brand'; f.page.referenceUrl.value = reference.url
    f.props.request.mockResolvedValueOnce({ ...ready(), status: 'off_topic', brief: undefined })
    await f.page.submit(true)
    expect(f.props.analyseReference).not.toHaveBeenCalled()
    expect(f.emit.mock.calls.filter(call => call[0] === 'generate')).toEqual([])
    f.props.request.mockResolvedValueOnce({ ...ready(), status: 'questions', brief: undefined, questions: [{ field: 'audience', prompt: 'Pour qui ?' }] })
    f.props.analyseReference.mockResolvedValueOnce({ ...ready(2), reference, status: 'questions', brief: undefined })
    await f.page.submit(true)
    expect(f.emit.mock.calls.filter(call => call[0] === 'generate')).toEqual([])
  })
  it('does not fetch a reference or generate after the component unmounts while saving', async () => {
    const f = harness(); f.page.message.value = 'My brand'; f.page.referenceUrl.value = reference.url
    let resolve!: (value: guided.StudioIntakeReply) => void
    f.props.request.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = f.page.submit(true); f.unmount(); resolve(ready()); await pending
    expect(f.props.analyseReference).not.toHaveBeenCalled()
    expect(f.emit.mock.calls.filter(call => call[0] === 'generate')).toEqual([])
  })
  it('prevents duplicate create clicks and respects unsaved edits and disabled state', async () => {
    const f = harness(); f.page.state.value = ready(); f.page.referenceUrl.value = reference.url
    let resolve!: (value: any) => void
    f.props.analyseReference.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = f.page.generateReady('ai')
    await f.page.generateReady('ai')
    resolve({ ...ready(2), reference }); await pending
    expect(f.props.analyseReference).toHaveBeenCalledTimes(1)
    expect(f.emit.mock.calls.filter(call => call[0] === 'generate')).toHaveLength(1)
    f.page.message.value = 'unsaved'; await f.page.generateReady('ai')
    f.page.message.value = ''; f.props.disabled = true; await f.page.generateReady('ai')
    expect(f.emit.mock.calls.filter(call => call[0] === 'generate')).toHaveLength(1)
  })
})
