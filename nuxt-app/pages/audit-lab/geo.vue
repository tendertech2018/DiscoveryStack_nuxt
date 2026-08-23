<script setup lang="ts">
type Metric = { id: string, label: string, before: number, after: number, delta: number, explanation: string }
type Result = {
  original: { title: string, content: string, language: 'en' | 'zh-hant' }
  candidate: {
    provider: string
    providerVersion: string
    optimizedTitle: string
    optimizedContent: string
    appliedRuleIds: string[]
    safetyNotes: string[]
    provenance: {
      execution: 'official-autogeo-api' | 'autogeo-framework-bailian-qwen' | 'reference-fallback'
      upstreamRepository: string
      upstreamRevision: string
      rewriteMethod: string
      ruleset: string
      model: string
      providerRequestId?: string
      usage?: { inputTokens?: number, outputTokens?: number, totalTokens?: number }
      fallbackReason?: 'bailian-not-configured' | 'bailian-invalid-configuration' | 'bailian-provider-unavailable' | 'autogeo-not-configured' | 'autogeo-provider-unavailable'
    }
  }
  baseline: { totalScore: number }
  optimized: { totalScore: number }
  comparison: Metric[]
  summary: string
  interpretationLimit: string
}

const form = reactive({
  title: '',
  content: '',
  language: 'zh-hant' as 'en' | 'zh-hant',
})
const state = ref<'idle' | 'running' | 'error' | 'ready'>('idle')
const errorMessage = ref('')
const result = ref<Result | null>(null)
const usesOfficialAutoGeo = computed(() => result.value?.candidate.provenance.execution === 'official-autogeo-api')
const usesBailianQwen = computed(() => result.value?.candidate.provenance.execution === 'autogeo-framework-bailian-qwen')
const usesLiveProvider = computed(() => usesOfficialAutoGeo.value || usesBailianQwen.value)
const usageLabel = computed(() => {
  const usage = result.value?.candidate.provenance.usage
  if (!usage?.totalTokens) return ''
  return `provider usage：${usage.totalTokens} tokens`
})

function fallbackLabel(reason?: Result['candidate']['provenance']['fallbackReason']) {
  const labels = {
    'bailian-not-configured': '尚未完成百煉 Qwen server-side 設定，且 Gemini provider 亦不可用',
    'bailian-invalid-configuration': '百煉 endpoint 設定無效；系統未發出 provider request',
    'bailian-provider-unavailable': '百煉 Qwen provider 本次無法提供可用回應',
    'autogeo-not-configured': '尚未設定 server-side Gemini credential',
    'autogeo-provider-unavailable': 'Gemini provider 本次無法提供可用回應',
  } as const
  return labels[reason || 'bailian-not-configured']
}

definePageMeta({ i18n: false, layout: 'owner' })
useHead({ title: '私有 GEO Workbench · DiscoveryStack', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] })

async function runOptimization() {
  state.value = 'running'
  errorMessage.value = ''
  result.value = null
  try {
    result.value = await $fetch<Result>('/api/geo/optimise', { method: 'POST', body: form })
    state.value = 'ready'
  } catch (error: unknown) {
    state.value = 'error'
    const status = (error as { status?: number, statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode
    const errorData = (error as { data?: { message?: string } }).data
    errorMessage.value = status === 401 ? '需要 owner 工作階段。請先從私有稽核實驗室登入。' : errorData?.message || '目前無法完成比較。輸入未被儲存。'
  }
}

function deltaClass(metric: Metric) {
  return metric.delta > 0 ? 'metric-up' : metric.delta < 0 ? 'metric-down' : 'metric-flat'
}
</script>

<template>
  <main class="geo-workbench">
    <header class="geo-header">
      <NuxtLink class="back-link" to="/audit-lab">← 返回私有稽核實驗室</NuxtLink>
      <p class="eyebrow">OWNER-ONLY · GEO WORKBENCH V1</p>
      <h1>把內容改得<br><em>更清楚、可驗證。</em></h1>
      <p>這是 owner-only 的無資料庫比較流程。完成百煉 Qwen server-side 設定後，會以 AutoGEO 官方 prompt／ruleset 執行；Gemini 官方 API 路線可作備援。未設定或 provider 無法使用時，會明確標示為 reference fallback。原文只在本次 request 中處理，不會儲存或訓練模型。</p>
    </header>

    <section class="geo-panel" aria-labelledby="input-title">
      <div class="section-number">01</div>
      <div>
        <p class="eyebrow">INPUT</p>
        <h2 id="input-title">貼入要人工審閱的原文</h2>
      </div>
      <form class="geo-form" @submit.prevent="runOptimization">
        <label><span>頁面標題</span><input v-model.trim="form.title" required maxlength="180" autocomplete="off" placeholder="例如：服務頁如何讓讀者理解下一步"></label>
        <label><span>語言</span><select v-model="form.language"><option value="zh-hant">繁體中文</option><option value="en">English</option></select></label>
        <label class="content-field"><span>原文（不會寫入資料庫）</span><textarea v-model="form.content" required maxlength="12000" rows="12" placeholder="貼入原文；請只處理你有權審閱的內容。"></textarea></label>
        <p class="input-note">完整 AutoGEO API 輸出與 reference fallback 都是人工審閱草稿；不會把 heuristic 分數說成外部搜尋排名，亦不得直接發布未驗證的數據、排名、流量或第三方背書。</p>
        <button type="submit" :disabled="state === 'running'">{{ state === 'running' ? '正在產生可比較版本…' : '產生 GEO 比較版本' }}</button>
      </form>
      <p v-if="state === 'error'" class="error-message" role="alert">{{ errorMessage }}</p>
    </section>

    <section v-if="result" class="result-stack" aria-live="polite">
      <section class="score-strip" aria-label="heuristic score comparison">
        <div><span>原文 heuristic</span><strong>{{ result.baseline.totalScore }}</strong></div>
        <div class="score-arrow" aria-hidden="true">→</div>
        <div><span>優化版 heuristic</span><strong>{{ result.optimized.totalScore }}</strong></div>
        <p>同一組 deterministic heuristic 下的結構比較，不是第三方生成式搜尋成效。</p>
      </section>

      <aside class="provider-note" :class="usesLiveProvider ? 'provider-live' : 'provider-fallback'">
        <strong>本次改寫來源</strong>
        <p v-if="usesBailianQwen">已使用 AutoGEO 官方 <code>{{ result.candidate.provenance.rewriteMethod }}</code> prompt／ruleset，透過百煉 Qwen <code>{{ result.candidate.provenance.model }}</code> 產生。這是 AutoGEO-framework provider，不是 AutoGEO Mini，也不是 upstream Gemini execution。</p>
        <p v-else-if="usesOfficialAutoGeo">已使用完整 AutoGEO 官方 <code>{{ result.candidate.provenance.rewriteMethod }}</code> Gemini 路徑，ruleset 為 {{ result.candidate.provenance.ruleset }}，模型為 <code>{{ result.candidate.provenance.model }}</code>。這不是 AutoGEO Mini。</p>
        <p v-else>完整 AutoGEO API 本次未執行（{{ fallbackLabel(result.candidate.provenance.fallbackReason) }}）。目前顯示的是 <code>reference-rules-v1</code> baseline，不是 AutoGEO 生成結果。</p>
        <small v-if="result.candidate.provenance.providerRequestId">Request correlation：<code>{{ result.candidate.provenance.providerRequestId }}</code></small>
        <small v-if="usageLabel">{{ usageLabel }}</small>
        <small>Upstream：{{ result.candidate.provenance.upstreamRepository }}@{{ result.candidate.provenance.upstreamRevision.slice(0, 12) }}</small>
      </aside>

      <section class="comparison-grid">
        <article class="content-card original-card">
          <p class="eyebrow">02 · ORIGINAL</p>
          <h2>{{ result.original.title }}</h2>
          <pre>{{ result.original.content }}</pre>
        </article>
        <article class="content-card optimized-card">
          <p class="eyebrow">03 · RULE-GUIDED VERSION</p>
          <h2>{{ result.candidate.optimizedTitle }}</h2>
          <pre>{{ result.candidate.optimizedContent }}</pre>
        </article>
      </section>

      <section class="geo-panel comparison-panel">
        <div class="section-number">04</div>
        <div><p class="eyebrow">COMPARE</p><h2>可比較的結構訊號</h2></div>
        <p class="summary">{{ result.summary }}</p>
        <div class="metric-list">
          <div v-for="metric in result.comparison" :key="metric.id" class="metric-row">
            <div><strong>{{ metric.label }}</strong><small>{{ metric.explanation }}</small></div>
            <div class="metric-score"><span>{{ metric.before }}</span><b>→</b><span>{{ metric.after }}</span><em :class="deltaClass(metric)">{{ metric.delta > 0 ? `+${metric.delta}` : metric.delta }}</em></div>
          </div>
        </div>
        <aside class="limit-note"><strong>解讀限制</strong><p>{{ result.interpretationLimit }}</p></aside>
        <aside class="safety-note"><strong>套用前人工檢查</strong><ul><li v-for="note in result.candidate.safetyNotes" :key="note">{{ note }}</li></ul></aside>
      </section>
    </section>
  </main>
</template>

<style scoped>
.geo-workbench { --ink:#12211d; --moss:#254b3f; --moss-soft:#d9e7dd; --paper:#f8f6ef; --line:#cad3c9; max-width:1180px; margin:0 auto; padding:3.75rem 1.5rem 6rem; color:var(--ink); }
.geo-header { max-width:780px; margin-bottom:3rem; }
.back-link { color:var(--moss); font-size:.88rem; font-weight:700; text-decoration:none; }
.back-link:hover { text-decoration:underline; }
.eyebrow { margin:1rem 0 .55rem; color:var(--moss); font-size:.72rem; font-weight:800; letter-spacing:.12em; }
h1 { margin:0; font-size:clamp(2.8rem,7vw,5.5rem); line-height:.9; letter-spacing:-.065em; } h1 em { color:var(--moss); font-family:Georgia,serif; font-weight:400; }
.geo-header > p:last-child { max-width:680px; color:#52645b; font-size:1.05rem; line-height:1.7; }
.geo-panel { display:grid; grid-template-columns:auto 1fr; gap:.3rem 1rem; margin-top:1.5rem; padding:1.75rem; border:1px solid var(--line); background:var(--paper); }
.section-number { color:#718177; font:italic 1.8rem Georgia,serif; }
h2 { margin:0; font-size:1.4rem; letter-spacing:-.035em; }
.geo-form { grid-column:1/-1; display:grid; grid-template-columns:1fr 180px; gap:1rem; margin-top:1rem; } label { display:grid; gap:.45rem; color:#42554b; font-size:.84rem; font-weight:700; } input, select, textarea { width:100%; box-sizing:border-box; border:1px solid #afbcaf; border-radius:4px; background:white; color:var(--ink); font:inherit; padding:.75rem; } textarea { resize:vertical; line-height:1.55; } .content-field, .input-note { grid-column:1/-1; } .input-note { margin:0; color:#5b6d62; font-size:.82rem; line-height:1.55; }
button { width:max-content; border:0; border-radius:3px; background:var(--moss); color:white; cursor:pointer; font:inherit; font-weight:800; padding:.78rem 1.1rem; } button:disabled { cursor:wait; opacity:.65; } .error-message { grid-column:1/-1; margin:.8rem 0 0; color:#9b2929; font-weight:700; }
.result-stack { margin-top:1.5rem; }.score-strip { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:1rem; padding:1.25rem 1.5rem; background:var(--moss); color:white; }.score-strip div { text-align:center; }.score-strip span { display:block; color:#cae1d1; font-size:.78rem; font-weight:700; }.score-strip strong { display:block; margin-top:.1rem; font-size:2.3rem; }.score-arrow { color:#c5e0cb; font-size:1.8rem; }.score-strip p { grid-column:1/-1; margin:0; color:#d4e5d9; font-size:.8rem; text-align:center; }
.provider-note { margin-top:1rem; padding:1rem; border-left:3px solid #5a6c60; background:#f3f4ef; color:#304138; }.provider-note p { margin:.35rem 0; line-height:1.55; }.provider-note small { color:#5b6d62; font-size:.76rem; }.provider-note code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.84em; }.provider-live { border-color:#277647; background:#eef7ef; }.provider-fallback { border-color:#a47521; background:#fff9eb; }
.comparison-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:1rem; }.content-card { min-width:0; border:1px solid var(--line); padding:1.4rem; }.original-card { background:#f6f2e9; }.optimized-card { background:#edf6ef; border-color:#9db6a4; }.content-card pre { max-height:480px; overflow:auto; margin:1.25rem 0 0; color:#34453b; font:inherit; white-space:pre-wrap; line-height:1.65; }
.comparison-panel { grid-template-columns:auto 1fr; }.summary, .metric-list, .limit-note, .safety-note { grid-column:1/-1; }.summary { margin:.7rem 0 0; line-height:1.6; }.metric-list { border-top:1px solid var(--line); }.metric-row { display:flex; justify-content:space-between; gap:1rem; padding:1rem 0; border-bottom:1px solid var(--line); }.metric-row strong, .metric-row small { display:block; }.metric-row small { max-width:620px; margin-top:.3rem; color:#5a6c60; line-height:1.45; }.metric-score { display:flex; align-items:center; gap:.5rem; white-space:nowrap; font-variant-numeric:tabular-nums; }.metric-score em { min-width:36px; font-style:normal; font-weight:800; }.metric-up { color:#17733d; }.metric-down { color:#b33232; }.metric-flat { color:#5a6c60; }.limit-note, .safety-note { padding:1rem; background:#fffaf0; border-left:3px solid #b58a38; }.safety-note { background:#eef5ef; border-color:#4b8660; }.limit-note p { margin:.35rem 0 0; line-height:1.55; }.safety-note ul { margin:.45rem 0 0; padding-left:1.2rem; line-height:1.55; }
@media (max-width:700px) { .geo-workbench { padding:2.2rem 1rem 4rem; }.geo-form, .comparison-grid { grid-template-columns:1fr; }.score-strip { grid-template-columns:1fr auto 1fr; padding:1rem; }.metric-row { display:grid; }.metric-score { justify-content:flex-start; } }
</style>
