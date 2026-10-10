<script setup lang="ts">
import type { GeoRewriteProvenance } from '../../server/geo/contracts'

type Metric = { id: string, label: string, before: number, after: number, delta: number, explanation: string }
type Result = {
  original: { title: string, content: string, language: 'en' | 'zh-hant' }
  candidate: { provider: string, providerVersion: string, optimizedTitle: string, optimizedContent: string, appliedRuleIds: string[], safetyNotes: string[], provenance: GeoRewriteProvenance }
  baseline: { totalScore: number }, optimized: { totalScore: number }, comparison: Metric[], summary: string, interpretationLimit: string
}
const form = reactive({ title: '', content: '', language: 'zh-hant' as 'en' | 'zh-hant' })
const state = ref<'idle' | 'running' | 'error' | 'ready'>('idle')
const errorMessage = ref('')
const result = ref<Result | null>(null)
const boundedPreview = ref(true)
const confirmedPublicContent = ref(false)
// This page disables repeat submission after dispatch, including ambiguous failures.
// It is not an account-wide spending cap: a new visit is a new explicit request.
const boundedPreviewSent = ref(false)
const canSubmit = computed(() => state.value !== 'running' && (!boundedPreview.value || (confirmedPublicContent.value && !boundedPreviewSent.value)))
const receipt = computed(() => result.value?.candidate.provenance.boundedPreviewReceipt)
const usesLiveProvider = computed(() => result.value?.candidate.provenance.execution !== 'reference-fallback')
const fallbackLabel = (reason?: string) => ({ 'bailian-not-configured': '尚未完成百煉 Qwen server-side 設定，且 Gemini provider 亦不可用', 'bailian-invalid-configuration': '百煉 endpoint 設定無效；系統未發出 provider request', 'bailian-provider-unavailable': '百鍊 Qwen provider 本次無法提供可用回應', 'provider-output-safety-rejected': 'provider 草稿含原文未支持的商業主張，已安全拒絕並改用 reference fallback', 'autogeo-not-configured': '尚未設定 server-side provider credential', 'autogeo-provider-unavailable': 'provider 本次無法提供可用回應' }[reason || 'bailian-not-configured'])
definePageMeta({ i18n: false, layout: 'owner' })
useHead({ title: '私有 GEO Workbench · DiscoveryStack', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] })
async function runOptimization() {
  if (!canSubmit.value) return
  const isBounded = boundedPreview.value
  if (isBounded) boundedPreviewSent.value = true
  state.value = 'running'; errorMessage.value = ''; result.value = null
  try {
    result.value = await $fetch<Result, '/api/geo/optimise'>('/api/geo/optimise', {
      method: 'POST', retry: 0,
      body: { ...form, ...(isBounded ? { mode: 'bounded-qwen-preview', confirmedPublicContent: confirmedPublicContent.value } : {}) },
    })
    state.value = 'ready'
  }
  catch (error: unknown) { state.value = 'error'; const status = (error as { status?: number, statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode; errorMessage.value = status === 401 ? '需要 owner 工作階段。請先從私有稽核實驗室登入。' : (error as { data?: { message?: string } }).data?.message || '目前無法完成比較。輸入未被儲存。' }
}
const deltaClass = (metric: Metric) => metric.delta > 0 ? 'metric-up' : metric.delta < 0 ? 'metric-down' : 'metric-flat'
</script>

<template>
  <main class="geo-workbench">
    <header class="geo-header"><NuxtLink class="back-link" to="/audit-lab">← 返回私有稽核實驗室</NuxtLink><p class="eyebrow">OWNER-ONLY · GEO WORKBENCH V1</p><h1>把內容改得<br><em>更清楚、可驗證。</em></h1><p>這是 owner-only 的無資料庫比較流程。完成百煉 Qwen server-side 設定後，會以完整 AutoGEO 官方 prompt／ruleset 執行；未設定或 provider 無法使用時，會明確標示為 reference fallback。原文只在本次 request 中處理，不會儲存或訓練模型。</p></header>
    <section class="geo-panel">
      <div class="wide"><p class="eyebrow">INPUT</p><h2>貼入要人工審閱的原文</h2></div>
      <form class="geo-form" @submit.prevent="runOptimization">
        <label>頁面標題<input v-model.trim="form.title" required maxlength="180" autocomplete="off" :disabled="state === 'running'"></label>
        <label>語言<select v-model="form.language" :disabled="state === 'running'"><option value="zh-hant">繁體中文</option><option value="en">English</option></select></label>
        <label class="wide">原文（不會寫入資料庫）<textarea v-model="form.content" required maxlength="12000" rows="12" :disabled="state === 'running'"></textarea></label>
        <fieldset class="wide preview-controls">
          <legend>本次草稿的費用與資料範圍</legend>
          <label class="checkbox-label"><input v-model="boundedPreview" type="checkbox" :disabled="state === 'running' || boundedPreviewSent">使用單次限額測試（建議）</label>
          <template v-if="boundedPreview">
            <p>只使用正式主機已設定的 Qwen 3.6 Plus，最多呼叫一次、輸出 2,048 tokens、關閉思考模式；失敗不重試，也不改用其他 AI。每次請求的費用上限 US$1，不是帳號累計額度。</p>
            <label class="checkbox-label"><input v-model="confirmedPublicContent" type="checkbox" :disabled="state === 'running' || boundedPreviewSent">我確認這是自家公開網站內容，沒有客戶或私人資料，並同意這一次最高 US$1 的 AI 測試費用。</label>
            <p>不寫入資料庫、不對外發布，也不開啟模型訓練。請求送出後，即使等待逾時也可能產生費用，請先核對用量再決定是否進行新的測試。</p>
          </template>
          <p v-else>一般模式保留原有流程：第一家 AI 失敗時，可能改用另一家；本頁不保證一般模式的 US$1 費用上限。</p>
        </fieldset>
        <p class="wide">完整 AutoGEO 輸出與 reference fallback 都是人工審閱草稿；不會把 heuristic 分數說成外部搜尋排名，亦不得直接發布未驗證的數據、排名、流量或第三方背書。</p>
        <button type="submit" :disabled="!canSubmit">{{ state === 'running' ? '正在產生可比較版本…' : boundedPreviewSent ? '本頁已送出一次，不會自動重試' : boundedPreview ? '產生一份限額測試草稿' : '產生 GEO 比較版本' }}</button>
      </form>
      <p v-if="state === 'error'" class="wide error" role="alert">{{ errorMessage }}</p>
    </section>
    <section v-if="receipt && result" class="geo-panel preview-receipt" aria-label="本次 AI 用量與費用" aria-live="polite">
      <div class="wide"><p class="eyebrow">SINGLE REQUEST RECEIPT</p><h2>本次 AI 測試已完成</h2></div>
      <dl class="wide receipt-grid">
        <div><dt>實際回報模型</dt><dd>{{ result.candidate.provenance.model }}</dd></div>
        <div><dt>呼叫次數</dt><dd>{{ receipt.attempts }} 次；沒有重試或其他 AI</dd></div>
        <div><dt>輸入／輸出用量</dt><dd>{{ result.candidate.provenance.usage?.inputTokens }} ／ {{ result.candidate.provenance.usage?.outputTokens }} tokens</dd></div>
        <div><dt>保守估算費用</dt><dd>US${{ receipt.estimatedCostUsd.toFixed(6) }}</dd></div>
      </dl>
      <p class="wide">本次同意上限 US${{ receipt.budgetUsd }}；依限制計算的最高費用 US${{ receipt.maxEstimatedCostUsd.toFixed(6) }}。採用 {{ receipt.priceCheckedAt }} 核對的較高區域單價估算，非供應商最終帳單。<a :href="receipt.pricingUrl" target="_blank" rel="noopener noreferrer">查看官方單價</a>。這份草稿尚未發布，亦未開啟模型訓練。</p>
    </section>
    <section v-if="result" class="result-stack" aria-live="polite"><div class="score-strip"><div><span>原文 heuristic</span><strong>{{ result.baseline.totalScore }}</strong></div><b>→</b><div><span>優化版 heuristic</span><strong>{{ result.optimized.totalScore }}</strong></div><p>同一組 deterministic heuristic 下的結構比較，不是第三方生成式搜尋成效。</p></div><aside class="provider-note" :class="usesLiveProvider ? 'provider-live' : 'provider-fallback'"><strong>本次改寫來源</strong><p v-if="usesLiveProvider">已使用完整 AutoGEO 官方 <code>{{ result.candidate.provenance.rewriteMethod }}</code> prompt／ruleset 產生草稿；這不是 AutoGEO Mini。</p><p v-else>完整 AutoGEO API 本次未執行（{{ fallbackLabel(result.candidate.provenance.fallbackReason) }}）。目前顯示的是 <code>reference-rules-v1</code> baseline，不是 AutoGEO 生成結果。</p><small>Upstream：{{ result.candidate.provenance.upstreamRepository }}@{{ result.candidate.provenance.upstreamRevision.slice(0,12) }}</small></aside><section class="comparison-grid"><article><p class="eyebrow">ORIGINAL</p><h2>{{ result.original.title }}</h2><pre>{{ result.original.content }}</pre></article><article><p class="eyebrow">RULE-GUIDED VERSION</p><h2>{{ result.candidate.optimizedTitle }}</h2><pre>{{ result.candidate.optimizedContent }}</pre></article></section><section class="geo-panel"><h2>可比較的結構訊號</h2><p class="wide">{{ result.summary }}</p><div class="metric-list wide"><div v-for="metric in result.comparison" :key="metric.id" class="metric-row"><div><strong>{{ metric.label }}</strong><small>{{ metric.explanation }}</small></div><div><span>{{ metric.before }}</span> → <span>{{ metric.after }}</span> <em :class="deltaClass(metric)">{{ metric.delta > 0 ? `+${metric.delta}` : metric.delta }}</em></div></div></div><aside class="wide limit-note"><strong>解讀限制</strong><p>{{ result.interpretationLimit }}</p></aside><aside class="wide safety-note"><strong>套用前人工檢查</strong><ul><li v-for="note in result.candidate.safetyNotes" :key="note">{{ note }}</li></ul></aside></section></section>
  </main>
</template>

<style scoped>
.preview-controls{margin:0;min-width:0;border:1px solid var(--line);padding:1rem;background:#fff}.preview-controls legend{font-weight:800;padding:0 .4rem}.checkbox-label{display:flex;align-items:flex-start;gap:.6rem;line-height:1.6}.checkbox-label input{width:1.1rem;height:1.1rem;flex:none;margin:.2rem 0 0}.preview-controls p{line-height:1.65;font-size:.88rem}.receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:0}.receipt-grid dt{font-size:.82rem;color:#4e6459}.receipt-grid dd{margin:.35rem 0 0;font-weight:700;overflow-wrap:anywhere}.preview-receipt{border-color:#277647}.preview-receipt p{line-height:1.65}.preview-receipt a{color:var(--moss)}@media(max-width:700px){.receipt-grid{grid-template-columns:1fr}.geo-form button{max-width:100%;white-space:normal;text-align:left}}
.geo-workbench{--ink:#12211d;--moss:#254b3f;--paper:#f8f6ef;--line:#cad3c9;max-width:1180px;margin:0 auto;padding:3.75rem 1.5rem 6rem;color:var(--ink)}.geo-header{max-width:780px;margin-bottom:3rem}.back-link{color:var(--moss);font-weight:700;text-decoration:none}.eyebrow{color:var(--moss);font-size:.72rem;font-weight:800;letter-spacing:.12em}h1{font-size:clamp(2.8rem,7vw,5.5rem);line-height:.9;letter-spacing:-.065em}h1 em{color:var(--moss);font-family:Georgia,serif;font-weight:400}.geo-panel{display:grid;grid-template-columns:1fr 180px;gap:1rem;margin-top:1.5rem;padding:1.75rem;border:1px solid var(--line);background:var(--paper)}.geo-form{display:grid;grid-column:1/-1;grid-template-columns:1fr 180px;gap:1rem}.wide{grid-column:1/-1}label{display:grid;gap:.45rem;font-size:.84rem;font-weight:700}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #afbcaf;border-radius:4px;background:#fff;color:var(--ink);font:inherit;padding:.75rem}textarea{resize:vertical;line-height:1.55}button{width:max-content;border:0;border-radius:3px;background:var(--moss);color:#fff;cursor:pointer;font:inherit;font-weight:800;padding:.78rem 1.1rem}button:disabled{cursor:wait;opacity:.65}.error{color:#9b2929;font-weight:700}.result-stack{margin-top:1.5rem}.score-strip{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;padding:1.25rem 1.5rem;background:var(--moss);color:#fff}.score-strip div{text-align:center}.score-strip span,.score-strip p{color:#d4e5d9}.score-strip strong{display:block;font-size:2.3rem}.score-strip p{grid-column:1/-1;margin:0;text-align:center}.provider-note{margin-top:1rem;padding:1rem;border-left:3px solid #5a6c60;background:#f3f4ef}.provider-live{border-color:#277647;background:#eef7ef}.provider-fallback{border-color:#a47521;background:#fff9eb}.comparison-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}.comparison-grid article{min-width:0;border:1px solid var(--line);padding:1.4rem;background:#f6f2e9}.comparison-grid article+article{background:#edf6ef}.comparison-grid pre{max-height:480px;overflow:auto;white-space:pre-wrap;font:inherit;line-height:1.65}.metric-list{border-top:1px solid var(--line)}.metric-row{display:flex;justify-content:space-between;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--line)}.metric-row small{display:block;margin-top:.3rem}.metric-up{color:#17733d}.metric-down{color:#b33232}.metric-flat{color:#5a6c60}.limit-note,.safety-note{padding:1rem;background:#fffaf0;border-left:3px solid #b58a38}.safety-note{background:#eef5ef;border-color:#4b8660}@media(max-width:700px){.geo-workbench{padding:2.2rem 1rem 4rem}.geo-panel,.geo-form,.comparison-grid{grid-template-columns:1fr}.score-strip{padding:1rem}.metric-row{display:grid}}
</style>
