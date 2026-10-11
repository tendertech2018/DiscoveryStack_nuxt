import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { describe, expect, it } from 'vitest'
import * as constants from '../server/geo-outcome-model/constants'
import { getWorkspace } from '../server/geo-outcome-model/service'
import { createMemoryGeoOutcomeRepository } from './support/geo-outcome-memory-repository'
import { trustedState } from './support/modelops-fixtures'

const require = createRequire(import.meta.url)
const vueRequire = createRequire(require.resolve('nuxt/package.json'))
const vue = vueRequire('vue'), { parse, compileScript } = vueRequire('vue/compiler-sfc')
const { renderToString } = vueRequire('vue/server-renderer')
const source = readFileSync(new URL('../components/GeoTrainingReadiness.vue', import.meta.url), 'utf8')
function component(stage: 'development' | 'shadow') {
  const parsed = parse(source, { filename: 'GeoTrainingReadiness.vue' })
  const compiled = compileScript(parsed.descriptor, { id: 'training-readiness', inlineTemplate: true, templateOptions: { ssr: true } })
  const js = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((id: string) => id.endsWith('/geo-outcome-model/constants') ? constants : id === 'vue' ? { ...vue, ref: () => vue.ref(stage) } : vueRequire(id), module, module.exports)
  return module.exports.default
}

describe('plain-language governed training readiness', () => {
  it('keeps unconfirmed counts unknown instead of inventing completed progress', async () => {
    const html = await renderToString(vue.createSSRApp(component('development'), { workspace: {} }))
    expect(html).toContain('尚無可確認數字')
    expect(html).toContain('不是從零訓練 ChatGPT')
    expect(html).toContain('/audit-lab/learning-loop#training')
    expect(html).toContain('本表不會啟動訓練或收費')
    expect(html).not.toContain('數量已達標')
  })
  it.each(['development', 'shadow'] as const)('renders real counts and the canonical %s thresholds, without mutations', async stage => {
    const counts = { candidates: 199, queryGroups: 30, websites: 5, engines: 2, positives: 20, hardNegatives: 40, observationSpanDays: 13 }
    const html = await renderToString(vue.createSSRApp(component(stage), { workspace: { trainingReadiness: { development: counts, shadow: counts } } }))
    expect(html).toContain(stage === 'development' ? '200' : '1000')
    expect(html).toContain(stage === 'development' ? '14' : '60')
    expect(html).toContain('仍不代表單一訓練資料集通過驗證')
    expect(html).not.toContain('<form')
    expect(source).not.toContain('$fetch')
  })
  it('uses eligible dataset member dates, not unrelated old observations, for the training span', async () => {
    const state = await trustedState()
    const baseline = await getWorkspace(42, createMemoryGeoOutcomeRepository(state))
    const extra = { ...state.observations[0]!, runTimestamp: '2000-01-01T00:00:00Z', observationFingerprint: 'f'.repeat(64), verificationStatus: 'unverified' as const }
    state.observations.push(extra)
    const current = await getWorkspace(42, createMemoryGeoOutcomeRepository(state))
    expect(current.inventory.observationSpanDays).toBeGreaterThan(baseline.inventory.observationSpanDays!)
    expect(current.trainingReadiness).toEqual(baseline.trainingReadiness)
    expect(current.trainingReadiness?.development.candidates).toBe(1000)
    expect(current.trainingReadiness?.development.observationSpanDays).toBe(499)
    expect(current.readiness).toEqual(baseline.readiness)
  })
  it('an empty owner workspace is insufficient, never a synthetic trained model', async () => {
    const workspace = await getWorkspace(42, createMemoryGeoOutcomeRepository())
    expect(workspace.trainingReadiness?.development).toMatchObject({ candidates: 0, observationSpanDays: null })
    expect(workspace.readiness.development.ready).toBe(false)
    expect(workspace.models).toEqual([])
  })
})
