<script setup lang="ts">
type HeadMetric = { head: string, macroF1: number | null, microF1: number | null, loss: number | null }
type TrainingReport = {
  reportVersion: string
  completedRun: null | {
    id: number
    provider: string | null
    modelFamily: string | null
    modelVersion: string | null
    featureContractVersion: string | null
    labelTaxonomyVersion: string | null
    splitVersion: string | null
    datasetDigest: string | null
    completedAt: string | null
    split: { train: number | null, validation: number | null, test: number | null }
    labelCounts: Record<string, number> | null
    heldOutLoss: number | null
    headMetrics: HeadMetric[]
    journeyConfusionMatrix: Record<string, Record<string, number>> | null
    artifact: { provider: string | null, engine: string | null, baseModel: string | null, checkpointSha256: string | null, checkpointAvailability: string | null, seed: number | null, taskHeads: string[] }
    trainingSettings: null | { maxLength: number, batchSize: number, epochs: number, learningRate: string, weightDecay: number, multiLabelThreshold: number }
    productionGate: { passed: boolean, minimumExamples: number, minimumPerStage: number, reason: string | null }
  }
}

const state = ref<'loading' | 'signin' | 'ready' | 'error'>('loading')
const report = ref<TrainingReport | null>(null)
const errorMessage = ref('')
const headLabels: Record<string, string> = {
  journeyStage: '使用者旅程階段', searchIntents: '搜尋意圖', contentTypes: '內容型態', audienceRoles: '受眾／角色', geoSignals: '地域訊號', citationReadiness: '引用準備度', technicalSeoSignals: '技術 SEO 訊號', frictionSignals: '摩擦訊號', actionPriority: '修復優先度',
}
const stageLabels: Record<string, string> = { discovery: '探索', understanding: '理解', response: '回應', progression: '推進', conversion: '轉換' }
const stages = ['discovery', 'understanding', 'response', 'progression', 'conversion']

definePageMeta({ i18n: false, layout: 'owner' })
useHead({ title: '101 筆訓練報告 · DiscoveryStack', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] })

function formatScore(value: number | null) { return value === null ? '—' : value.toFixed(4) }
function matrixValue(row: string, column: string) {
  const matrix = report.value?.completedRun?.journeyConfusionMatrix
  return matrix?.[row]?.[column] ?? '—'
}
function startAuditSignIn() { window.location.assign(`/api/auth/login?origin=${encodeURIComponent(window.location.origin)}`) }

async function loadReport() {
  state.value = 'loading'
  try {
    report.value = await $fetch<TrainingReport>('/api/intelligence/training-report')
    state.value = 'ready'
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number, status?: number }).statusCode ?? (error as { status?: number }).status
    if (statusCode === 401 || statusCode === 403) state.value = 'signin'
    else { errorMessage.value = '訓練報告目前無法讀取；既有訓練 ledger 未被改寫。'; state.value = 'error' }
  }
}

onMounted(loadReport)
</script>

<template>
  <section class="training-report" aria-labelledby="training-report-title">
    <header class="training-report__header">
      <p class="training-report__eyebrow">私有／受治理訓練證據</p>
      <h1 id="training-report-title">101 筆訓練。<br><em>如實報告。</em></h1>
      <p>這是既有完成的 Colab v2 ledger 摘要。頁面只顯示經投影的模型 lineage 與離線數字，不顯示原始文本、特徵向量、權重、憑證或遠端工作識別資訊。</p>
      <nav aria-label="私有工作台導覽"><NuxtLink to="/audit-lab">返回 Audit Lab</NuxtLink><NuxtLink to="/audit-lab/geo">開啟 GEO Workbench</NuxtLink></nav>
    </header>

    <p v-if="state === 'loading'" class="training-report__state" aria-live="polite">正在載入 owner-only 訓練 ledger…</p>
    <section v-else-if="state === 'signin'" class="training-report__state" aria-labelledby="signin-title"><p class="training-report__eyebrow">需要 owner 工作階段</p><h2 id="signin-title">訓練報告不是公開內容。</h2><p>請以已授權的 owner 身分登入，才可檢視歷史訓練狀態與離線評估。</p><button type="button" @click="startAuditSignIn">登入稽核實驗室</button></section>
    <p v-else-if="state === 'error'" class="training-report__state training-report__state--error" role="alert">{{ errorMessage }}</p>
    <section v-else-if="report?.completedRun" class="training-report__body">
      <aside class="training-report__warning" :class="{ 'training-report__warning--passed': report.completedRun.productionGate.passed }">
        <strong>{{ report.completedRun.productionGate.passed ? 'Production gate 已通過' : 'Development-only：production gate 未通過' }}</strong>
        <p>{{ report.completedRun.productionGate.reason || '可依核准流程評估 production inference eligibility。' }}</p>
        <p>本頁指標是固定 held-out split 的離線評估，<b>不代表</b>搜尋排名、生成式可見度、流量或轉換已提升；那些結果須以另行核准的實驗與觀測資料驗證。</p>
      </aside>

      <div class="training-report__grid">
        <article><span>完成 run</span><strong>#{{ report.completedRun.id }}</strong><small>{{ report.completedRun.completedAt || '完成時間未於安全摘要提供' }}</small></article>
        <article><span>資料分割</span><strong>{{ report.completedRun.split.train }} / {{ report.completedRun.split.validation }} / {{ report.completedRun.split.test }}</strong><small>train / validation / held-out test</small></article>
        <article><span>Held-out loss</span><strong>{{ formatScore(report.completedRun.heldOutLoss) }}</strong><small>僅為離線測試 loss</small></article>
        <article><span>checkpoint 狀態</span><strong>{{ report.completedRun.artifact.checkpointAvailability || 'owner browser download' }}</strong><small>不會在網站 runtime 載入權重</small></article>
      </div>

      <section class="training-report__card" aria-labelledby="lineage-title"><p class="training-report__eyebrow">可稽核 lineage</p><h2 id="lineage-title">模型、資料與 artifact。</h2><dl><div><dt>Provider</dt><dd>{{ report.completedRun.provider || '—' }}</dd></div><div><dt>Model</dt><dd>{{ report.completedRun.modelVersion || '—' }}</dd></div><div><dt>Base model</dt><dd>{{ report.completedRun.artifact.baseModel || '—' }}</dd></div><div><dt>Dataset SHA-256</dt><dd class="training-report__hash">{{ report.completedRun.datasetDigest || '—' }}</dd></div><div><dt>Checkpoint SHA-256</dt><dd class="training-report__hash">{{ report.completedRun.artifact.checkpointSha256 || '未於安全投影提供' }}</dd></div><div><dt>Split</dt><dd>{{ report.completedRun.splitVersion || '—' }}</dd></div><div><dt>固定 seed</dt><dd>{{ report.completedRun.artifact.seed ?? '未於安全投影提供' }}</dd></div><div><dt>Task heads</dt><dd>{{ report.completedRun.artifact.taskHeads.join(' · ') || '—' }}</dd></div><div v-if="report.completedRun.trainingSettings"><dt>訓練設定</dt><dd>max length {{ report.completedRun.trainingSettings.maxLength }} · batch {{ report.completedRun.trainingSettings.batchSize }} · {{ report.completedRun.trainingSettings.epochs }} epochs · LR {{ report.completedRun.trainingSettings.learningRate }} · weight decay {{ report.completedRun.trainingSettings.weightDecay }} · threshold {{ report.completedRun.trainingSettings.multiLabelThreshold }}</dd></div></dl></section>

      <section class="training-report__card" aria-labelledby="metrics-title"><p class="training-report__eyebrow">Held-out evaluation</p><h2 id="metrics-title">九個 task head 的離線指標。</h2><p>單選 head：使用者旅程階段、修復優先度；其餘七個 head：多標籤評估。所有分數均來自既有 completed run 的安全數字摘要。</p><div class="training-report__table-wrap"><table><thead><tr><th>Task head</th><th>Macro-F1</th><th>Micro-F1</th><th>Loss</th></tr></thead><tbody><tr v-for="metric in report.completedRun.headMetrics" :key="metric.head"><th>{{ headLabels[metric.head] || metric.head }}</th><td>{{ formatScore(metric.macroF1) }}</td><td>{{ formatScore(metric.microF1) }}</td><td>{{ formatScore(metric.loss) }}</td></tr><tr v-if="!report.completedRun.headMetrics.length"><td colspan="4">此 completed run 尚未在目前安全 ledger projection 提供 per-head metrics。</td></tr></tbody></table></div></section>

      <section class="training-report__card" aria-labelledby="confusion-title"><p class="training-report__eyebrow">Journey-stage diagnostics</p><h2 id="confusion-title">使用者旅程階段 confusion matrix。</h2><div v-if="report.completedRun.journeyConfusionMatrix" class="training-report__table-wrap"><table><thead><tr><th>實際 \ 預測</th><th v-for="stage in stages" :key="stage">{{ stageLabels[stage] }}</th></tr></thead><tbody><tr v-for="row in stages" :key="row"><th>{{ stageLabels[row] }}</th><td v-for="column in stages" :key="column">{{ matrixValue(row, column) }}</td></tr></tbody></table></div><p v-else>此 completed run 的安全 ledger projection 沒有 confusion matrix；不以缺失資料補造數值。</p></section>

      <section class="training-report__card" aria-labelledby="boundary-title"><p class="training-report__eyebrow">產品邊界</p><h2 id="boundary-title">離線訓練與 AutoGEO rewrite 是兩條不同路徑。</h2><p>此 supervised run 僅提供發展階段的診斷證據，且 checkpoint 不是 server-deployable inference artifact。GEO Workbench 的實際改寫服務則是獨立、request-scoped 的 <strong>AutoGEO-framework / Bailian Qwen</strong> provider；它不會把此 101 筆資料送往百煉，也不會把百煉 API 誤稱為受監督模型訓練。</p></section>
    </section>
    <section v-else class="training-report__state"><p class="training-report__eyebrow">尚無相符 ledger</p><h2>找不到已完成的 101 筆 v2 run。</h2><p>沒有補造報告，也不會在網站 Autoscale runtime 啟動重訓。</p></section>
  </section>
</template>

<style scoped>
.training-report { max-width: 1120px; margin: 0 auto; padding: clamp(2rem, 5vw, 5rem) 1.25rem 5rem; color: #17231d; background: #f8f5ec; min-height: 100vh; }
.training-report__header { max-width: 780px; padding-bottom: 2.25rem; border-bottom: 1px solid #bec8b6; }
.training-report__header h1 { margin: .2rem 0 1rem; font: 600 clamp(2.4rem, 6vw, 5.8rem)/.93 Georgia, serif; letter-spacing: -.055em; }
.training-report__header h1 em { color: #436c51; font-weight: 500; }
.training-report__header p, .training-report__card p, .training-report__warning p { line-height: 1.7; }
.training-report__eyebrow { margin: 0; color: #56715e; font-size: .76rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.training-report__header nav { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.25rem; }
.training-report__header a, .training-report__state button { display: inline-block; border: 1px solid #294a35; background: #294a35; color: #fff; text-decoration: none; padding: .7rem .95rem; border-radius: .25rem; font-weight: 700; cursor: pointer; }
.training-report__header a + a { background: transparent; color: #294a35; }
.training-report__state { margin-top: 2rem; padding: 2rem; border: 1px solid #bec8b6; background: #fffdf7; }
.training-report__state--error { border-color: #9c3d36; color: #7c2924; }
.training-report__body { margin-top: 2rem; }
.training-report__warning { padding: 1.2rem 1.35rem; border-left: .35rem solid #a94d22; background: #fff3dd; }
.training-report__warning--passed { border-color: #436c51; background: #eef5e9; }
.training-report__warning p { margin: .5rem 0 0; }
.training-report__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .8rem; margin: 1.25rem 0; }
.training-report__grid article, .training-report__card { background: #fffdf7; border: 1px solid #bec8b6; padding: 1.25rem; }
.training-report__grid span, .training-report__grid small { display: block; color: #5d6a62; }
.training-report__grid strong { display: block; margin: .45rem 0; font-size: 1.2rem; overflow-wrap: anywhere; }
.training-report__card { margin-top: 1rem; }
.training-report__card h2 { margin: .25rem 0 .65rem; font: 600 clamp(1.45rem, 3vw, 2.2rem)/1 Georgia, serif; }
.training-report__card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem 1.25rem; }
.training-report__card dl div { border-top: 1px solid #dde2d7; padding-top: .55rem; }
.training-report__card dt { color: #5d6a62; font-size: .8rem; }
.training-report__card dd { margin: .2rem 0 0; overflow-wrap: anywhere; }
.training-report__hash { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; }
.training-report__table-wrap { overflow-x: auto; }
.training-report table { width: 100%; border-collapse: collapse; min-width: 600px; }
.training-report th, .training-report td { padding: .75rem; text-align: left; border-bottom: 1px solid #dde2d7; }
.training-report th { color: #355a43; }
@media (max-width: 720px) { .training-report__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .training-report__card dl { grid-template-columns: 1fr; } }
</style>
