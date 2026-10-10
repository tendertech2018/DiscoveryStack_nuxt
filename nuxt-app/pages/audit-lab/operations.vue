<script setup lang="ts">
definePageMeta({ layout: 'owner' })
useHead({ title: '營運狀態｜DiscoveryStack', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] })

type Heartbeat = { lastStartedAt?: string | null; lastCompletedAt?: string | null; lastSucceededAt?: string | null; lastFailedAt?: string | null; lastOutcome?: string; activeRuns?: number }
type TaskStatus = 'disabled' | 'running' | 'running_unproven' | 'healthy' | 'not_observed' | 'stale' | 'failing'
type OperationsReport = {
  status: 'ready' | 'not_ready'
  checkedAt: string
  database: {
    status: 'ready' | 'not_ready'
    release: { marker: string; commit: string | null } | string
    database: { status: string; reasonCode: string | null }
    migrations: { status: string; reasonCode: string | null; expectedCount?: number; observedCount?: number; expectedLatestTag?: string; mismatchTag?: string | null }
  }
  scheduler: { status: string; processStartedAt: string; tasks: Array<{ name: string; cron: string; maxHeartbeatAgeMs: number; feature: { enabled: boolean }; status: TaskStatus; heartbeat: Heartbeat | null }> }
  limitations: string[]
}

const report = ref<OperationsReport | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const fetchReport = $fetch as unknown as <T>(url: string) => Promise<T>
const filter = ref('all')
const attentionStatuses: TaskStatus[] = ['stale', 'failing', 'not_observed', 'running_unproven']
const visibleTasks = computed(() => (report.value?.scheduler.tasks || []).filter(task => filter.value === 'all' || (filter.value === 'enabled' ? task.feature.enabled : attentionStatuses.includes(task.status))))
const sourceCommit = computed(() => typeof report.value?.database.release === 'object' ? report.value.database.release.commit : null)
const labels: Record<TaskStatus, string> = { disabled: '已停用', running: '執行中', running_unproven: '執行中，等待成功紀錄', healthy: '最近執行成功', not_observed: '尚未觀測到執行', stale: '逾期未回報', failing: '最近執行失敗' }
const schedulerLabels: Record<string, string> = { ready: '已觀測到正常執行', disabled: '排程功能未啟用', awaiting_observation: '等待執行證據', degraded: '有任務需要處理' }
const taskNames: Record<string, string> = {
  'model-improvement:collect': '模型改善', 'content-operations:geo-modelops-tick': '引用模型維護', 'managed-sites:editor-tick': '網頁編輯',
  'managed-sites:provisioning-tick': '客戶網站佈建', 'managed-sites:email-outbox-tick': '郵件寄送與清理', 'system-factory:provisioning-tick': '系統佈建',
  'content-operations:tick': '內容工作排程', 'content-operations:execution-tick': '內容產稿與執行', 'llm-visibility:benchmark-tick': 'AI 搜尋觀測',
  'weekly-content:tick': '每週文章與 LINE', 'learning-loop:tick': '資料學習與保留', 'content-operations:measurement-tick': '搜尋與流量量測',
}

function dateLabel(value?: string | null) {
  if (!value) return '尚無紀錄'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '時間無效' : new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Taipei' }).format(date)
}

async function refresh() {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  report.value = null
  try { report.value = await fetchReport<OperationsReport>('/api/operations/readiness') }
  catch (error: unknown) {
    const status = (error as { statusCode?: number; response?: { status?: number } })?.statusCode || (error as { response?: { status?: number } })?.response?.status
    errorMessage.value = status === 401 ? '請先登入擁有人帳號，再讀取營運狀態。' : '目前無法取得營運狀態。請檢查服務與資料庫連線後重試。'
  } finally { loading.value = false }
}
onMounted(refresh)
</script>

<template>
  <section class="operations-page">
    <header class="operations-header">
      <div><p class="eyebrow">DISCOVERYSTACK / OPERATIONS</p><h1>營運狀態</h1><p>檢查目前部署、資料庫版本與背景工作，找出需要處理的項目。</p></div>
      <button type="button" :disabled="loading" @click="refresh">{{ loading ? '檢查中…' : '重新檢查' }}</button>
    </header>
    <p v-if="loading" role="status">正在讀取部署及排程證據…</p>
    <p v-if="errorMessage" class="notice notice--error" role="alert">{{ errorMessage }} <NuxtLink to="/audit-lab">返回工作總覽</NuxtLink></p>
    <template v-if="report">
      <p class="checked-at">檢查時間：{{ dateLabel(report.checkedAt) }}（台北）</p>
      <div class="summary">
        <section class="panel"><h2>服務與資料庫</h2><strong :class="report.status === 'ready' ? 'positive' : 'attention'">{{ report.status === 'ready' ? '檢查通過' : '待處理' }}</strong><p>{{ report.database.database.status === 'pass' ? '資料庫連線正常' : '資料庫檢查尚未通過' }}</p><code v-if="report.database.database.reasonCode">{{ report.database.database.reasonCode }}</code></section>
        <section class="panel"><h2>資料庫版本</h2><strong :class="report.database.migrations.status === 'exact' ? 'positive' : 'attention'">{{ report.database.migrations.status === 'exact' ? '與程式一致' : '尚未確認一致' }}</strong><p v-if="report.database.migrations.expectedCount !== undefined">已記錄 {{ report.database.migrations.observedCount ?? '—' }} / 預期 {{ report.database.migrations.expectedCount }}</p><code v-if="report.database.migrations.reasonCode">{{ report.database.migrations.reasonCode }}</code></section>
        <section class="panel"><h2>背景工作</h2><strong>{{ schedulerLabels[report.scheduler.status] || '等待檢查' }}</strong><p>本程序啟動：{{ dateLabel(report.scheduler.processStartedAt) }}</p></section>
      </div>
      <p class="notice">檢查通過代表目前版本、資料庫與已啟用排程的檢查結果；客戶實際收信、LINE 核准、正式發布及模型品質仍依各自驗收紀錄判定。</p>
      <section class="panel release-panel"><h2>目前部署</h2><dl><dt>程式版本</dt><dd><code>{{ sourceCommit || '尚未提供版本識別' }}</code></dd><dt>預期最新 migration</dt><dd><code>{{ report.database.migrations.expectedLatestTag || '尚未讀取' }}</code></dd><dt v-if="report.database.migrations.mismatchTag">不一致位置</dt><dd v-if="report.database.migrations.mismatchTag"><code>{{ report.database.migrations.mismatchTag }}</code></dd></dl></section>
      <section class="panel">
        <div class="task-toolbar"><h2>背景工作紀錄</h2><label>顯示<select v-model="filter"><option value="all">全部任務</option><option value="enabled">已啟用</option><option value="attention">待處理</option></select></label></div>
        <p>紀錄僅涵蓋此程序，重新啟動後會重新累積。已停用的任務不會顯示為執行成功。</p>
        <div class="task-table"><table><thead><tr><th scope="col">工作</th><th scope="col">狀態</th><th scope="col">最後開始</th><th scope="col">最後完成</th></tr></thead><tbody><tr v-for="task in visibleTasks" :key="task.name"><th scope="row">{{ taskNames[task.name] || task.name }}<small>{{ task.cron }}</small></th><td><span class="state" :class="{ 'state--attention': attentionStatuses.includes(task.status), 'state--positive': task.status === 'healthy' }">{{ labels[task.status] }}</span></td><td>{{ dateLabel(task.heartbeat?.lastStartedAt) }}</td><td>{{ dateLabel(task.heartbeat?.lastCompletedAt) }}</td></tr><tr v-if="!visibleTasks.length"><td colspan="4">沒有符合條件的任務。</td></tr></tbody></table></div>
      </section>
      <section class="panel"><h2>接著處理</h2><nav class="next-links" aria-label="相關營運工作"><NuxtLink to="/audit-lab/weekly-content">文章送審與 LINE</NuxtLink><NuxtLink to="/audit-lab/email-delivery">郵件投遞紀錄</NuxtLink><NuxtLink to="/audit-lab/measurement-operations">成效量測</NuxtLink><NuxtLink to="/audit-lab/managed-sites/setup">供應商設定</NuxtLink><NuxtLink to="/audit-lab/learning-loop">資料授權與學習</NuxtLink></nav></section>
    </template>
  </section>
</template>

<style scoped>
.operations-page{max-width:1180px;margin:0 auto;padding:clamp(1rem,3vw,2.5rem);color:#17253d}.operations-header{display:flex;justify-content:space-between;align-items:center;gap:1rem}.operations-header h1{margin:.25rem 0;font-size:clamp(1.8rem,4vw,2.6rem)}.operations-header p,.panel p,.checked-at{color:#536477;line-height:1.65}.eyebrow{font-size:.7rem;letter-spacing:.1em}.operations-page button,.operations-page select{font:inherit;min-height:44px;border:1px solid #bccadb;border-radius:.5rem;background:#fff;color:#17253d;padding:.6rem .85rem}.operations-page button{cursor:pointer}.operations-page button:disabled{cursor:wait;opacity:.65}.operations-page button:focus-visible,.operations-page select:focus-visible,.operations-page a:focus-visible{outline:3px solid #5585b9;outline-offset:3px}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:1rem 0}.panel{min-width:0;padding:1.1rem;border:1px solid #d9e1eb;border-radius:.8rem;background:#fff;margin-block:1rem}.summary .panel{margin:0}.panel h2{font-size:1rem;margin:0 0 .85rem}.summary strong{font-size:1.2rem}.positive{color:#20643f}.attention{color:#985119}.notice{padding:.9rem 1rem;line-height:1.65;border-left:3px solid #c59c51;background:#fff8eb}.notice--error{border-color:#a83535;background:#fff0ef}.operations-page code{overflow-wrap:anywhere;white-space:normal;font-size:.8rem}.release-panel dl{display:grid;grid-template-columns:10rem minmax(0,1fr);gap:.6rem}.release-panel dt{color:#536477}.release-panel dd{margin:0}.task-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem}.task-toolbar label{display:flex;align-items:center;gap:.6rem}.task-table{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;font-size:.83rem}th,td{padding:.8rem .55rem;border-bottom:1px solid #e3e8ee}th small{display:block;margin-top:.3rem;color:#627084;font-weight:400}td{white-space:nowrap}.state{display:inline-block;border-radius:.35rem;padding:.35rem .55rem;background:#eef2f6;color:#536477}.state--attention{background:#fff1da;color:#885012}.state--positive{background:#e4f2e9;color:#20643f}.next-links{display:flex;flex-wrap:wrap;gap:.8rem 1.5rem}.next-links a,.notice a{color:#244e7e;text-underline-offset:.2rem}.next-links a{min-height:44px;display:flex;align-items:center}@media(max-width:760px){.summary{grid-template-columns:1fr}.operations-header{align-items:flex-start;flex-wrap:wrap}.release-panel dl{grid-template-columns:1fr}.release-panel dd{margin-bottom:.5rem}.task-toolbar{align-items:flex-start;flex-wrap:wrap}}
</style>
