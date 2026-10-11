import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import * as client from '../utils/draftAdvice'

const require = createRequire(import.meta.url), vueRequire = createRequire(require.resolve('nuxt/package.json'))
const vue = vueRequire('vue'), { parse, compileScript } = vueRequire('vue/compiler-sfc')
const { renderToString } = vueRequire('vue/server-renderer')
const source = readFileSync(new URL('../components/OwnerDraftAdvice.vue', import.meta.url), 'utf8')
const hash = 'a'.repeat(64)
const identity = { contractVersion: 'exact-draft-model-advice-v2', entryId: 17, draftId: 29, draftVersion: 1, contentHash: hash, modelArtifactHash: hash, datasetManifestHash: hash, predictionIsVerifiedOutcome: false, publicationAuthorization: false, productionModelActivation: false, crossDraftRankingAllowed: false }
const context = { fingerprint: hash, engine: 'chatgpt', model: 'synthetic', modelVersion: 'v1', interface: 'consumer_surface', locale: 'en', region: 'US', memberCount: 10 }
const ready = { ...identity, status: 'ready', experimentalScore: .25, representedContext: context, contextSource: 'owner_selected_dataset_context', contextIsObservedForDraft: false, featureContributions: [{ key: 'heading', contribution: .1, missing: false }], missingFeatureList: ['source'], reviewSuggestions: [{ id: 'missing_evidence', priority: 'check_first', basis: 'missing_data', title: '先補齊未知資訊', explanation: '合成測試，不是模型成效證據。' }], limitations: ['synthetic'], adviceFingerprint: hash }
const props = () => vue.reactive({ entries: [{ id: 17, draftId: 29, topicCluster: 'Synthetic topic', status: 'awaiting_review' }, { id: 18, draftId: 30, topicCluster: 'Second topic', status: 'awaiting_review' }], models: [{ artifactId: `geo-model-${hash}`, status: 'approved_for_shadow', fallbackOnly: false, taskType: 'citation_selection' }], loadError: false })

function compile(fetcher: unknown, ssr: boolean, initial?: unknown) {
  // Expose only to the test harness; run the production setup/handler unchanged.
  const injected = source.replace('</script>', '\ndefineExpose({ entryId, artifactId, contextFingerprint, requestAdvice, result, error, busy, canRequest });\n</script>')
  const parsed = parse(injected, { filename: 'OwnerDraftAdvice.vue' })
  const compiled = compileScript(parsed.descriptor, { id: 'advice-runtime', inlineTemplate: true, templateOptions: { ssr } })
  const js = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  let initialized = false
  const vueForTest = initial ? { ...vue, ref: (value: unknown) => { if (value === null && !initialized) { initialized = true; return vue.ref(initial) } return vue.ref(value) } } : vue
  new Function('require', 'module', 'exports', '$fetch', js)((id: string) => id === '../utils/draftAdvice' ? client : id === 'vue' ? vueForTest : vueRequire(id), module, module.exports, fetcher)
  return module.exports.default
}

function setup(fetcher: unknown, input = props()) {
  // Setup execution uses real Vue refs/computeds; lifecycle is scoped and disposed.
  const component = compile(fetcher, false)
  const scope = vue.effectScope()
  let exposed: any
  scope.run(() => component.setup(input, { expose: (value: unknown) => { exposed = value } }))
  return { state: exposed, input, stop: () => scope.stop() }
}

describe('actual model advice component and safe response contract', () => {
  it('renders honest empty and ready cards using the actual Vue template', async () => {
    const fetcher = vi.fn()
    const empty = await renderToString(vue.createSSRApp(compile(fetcher, true), { entries: [], models: [] }))
    expect(empty).toContain('沒有資料時不會用示範分數代替')
    const html = await renderToString(vue.createSSRApp(compile(fetcher, true, ready), props()))
    for (const copy of ['先補齊未知資訊', '模型實驗分數：0.250', '不是引用成功機率', '不是這份草稿的實際觀測', '模型雜湊', '不改文章、不發布、不開啟訓練']) expect(html).toContain(copy)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requests explicit contexts, accepts only selected context and prevents duplicate in-flight requests', async () => {
    let resolve!: (value: unknown) => void
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValueOnce(ready)
    const f = setup(fetcher), s = f.state
    s.entryId.value = 17; s.artifactId.value = `geo-model-${hash}`
    const first = s.requestAdvice(); await s.requestAdvice()
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolve({ ...identity, status: 'context_required', contexts: [context, { ...context, fingerprint: 'b'.repeat(64), engine: 'gemini' }] })
    await first
    expect(s.canRequest.value).toBe(false)
    s.contextFingerprint.value = hash
    await s.requestAdvice()
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ retry: 0, body: { entryId: 17, contextFingerprint: hash } })
    expect(s.result.value.status).toBe('ready')
    f.stop()
  })
  it('drops a late response when the selected draft or workspace changes', async () => {
    let resolve!: (value: unknown) => void
    const fetcher = vi.fn(() => new Promise(r => { resolve = r }))
    const f = setup(fetcher), s = f.state
    s.entryId.value = 17; s.artifactId.value = `geo-model-${hash}`
    const request = s.requestAdvice(); s.entryId.value = 18
    resolve(ready); await request
    expect(s.result.value).toBeNull()
    expect(s.error.value).toBe('')
    s.result.value = ready; f.input.loadError = true
    expect(s.result.value).toBeNull(); expect(s.canRequest.value).toBe(false)
    f.stop()
  })
  it('clears old advice on a rejected request and never displays raw secrets', async () => {
    const fetcher = vi.fn().mockRejectedValue({ data: { message: 'synthetic-secret', data: { code: 'ADVICE_LINEAGE_CHANGED' } } })
    const f = setup(fetcher), s = f.state
    s.entryId.value = 17; s.artifactId.value = `geo-model-${hash}`; s.result.value = ready
    await s.requestAdvice()
    expect(s.result.value).toBeNull(); expect(s.error.value).toContain('結果已捨棄')
    expect(s.error.value).not.toContain('synthetic-secret'); expect(fetcher).toHaveBeenCalledTimes(1)
    f.stop()
  })
  it.each([{ experimentalScore: NaN }, { publicationAuthorization: true }, { crossDraftRankingAllowed: true }, { productionModelActivation: true }, { contextIsObservedForDraft: true }, { secret: 'synthetic-secret' }, { representedContext: { ...context, fingerprint: 'bad' } }])('rejects invalid or privilege-expanding results %j', patch => {
    expect(client.parseDraftAdviceResponse({ ...ready, ...patch })).toBeNull()
  })
  it.each(['__proto__', 'toString', 'synthetic-secret'])('does not reflect an unrecognized failure %s', code => {
    expect(client.draftAdviceErrorMessage({ data: { data: { code }, message: code } })).not.toContain(code)
  })
})
