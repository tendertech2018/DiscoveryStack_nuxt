<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { monthlyReportCsv, type ManagedSiteMonthlyReport, type MonthlyEstimate } from '../../../utils/managedSiteMonthlyReport'
import { managedSiteReportCopy } from '../../../utils/managedSiteReportCopy'
import { htmlSiteLanguage, siteTextDirection } from '../../../utils/managedSiteLanguage'

type ReportResult = ManagedSiteMonthlyReport | { status: 'not_configured' }
// Keep the route DTO explicit without recursively instantiating all Nitro routes.
const fetchReport = $fetch as unknown as (path: '/api/managed-sites/customer/monthly-report', options: { query: { month?: string } }) => Promise<ReportResult>
const report = ref<ManagedSiteMonthlyReport | null>(null)
const month = ref('')
const locale = ref('en')
const busy = ref(false)
const state = ref<'idle' | 'not_configured' | 'error'>('idle')
const copy = computed(() => managedSiteReportCopy(locale.value))
let sequence = 0
useHead(() => ({ title: copy.value.title, meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }, { name: 'referrer', content: 'no-referrer' }] }))
const rate = (estimate: MonthlyEstimate) => estimate ? `${(estimate.rate * 100).toFixed(1)}%` : copy.value.unknown
const interval = (estimate: MonthlyEstimate) => estimate ? `${(estimate.confidenceInterval.lower * 100).toFixed(1)}–${(estimate.confidenceInterval.upper * 100).toFixed(1)}%` : ''
async function load() {
  const request = ++sequence
  busy.value = true; state.value = 'idle'; report.value = null
  try {
    const result = await fetchReport('/api/managed-sites/customer/monthly-report', { query: month.value ? { month: month.value } : {} })
    if (request !== sequence) return
    if (result.status === 'not_configured') state.value = 'not_configured'
    else { report.value = result; locale.value = result.locale; month.value = result.month }
  } catch { if (request === sequence) state.value = 'error' }
  finally { if (request === sequence) busy.value = false }
}
function download() {
  if (!report.value || busy.value) return
  const url = URL.createObjectURL(new Blob([monthlyReportCsv(report.value)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `visibility-${report.value.month}.csv`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function printReport() { if (report.value && !busy.value) window.print() }
onMounted(() => { locale.value = navigator.language; void load() })
onBeforeUnmount(() => { sequence++ })
</script>

<template>
  <main class="monthly-report" :lang="htmlSiteLanguage(locale)" :dir="siteTextDirection(locale)">
    <nav class="report-controls"><NuxtLink to="/customer/managed-sites">← {{ copy.back }}</NuxtLink></nav>
    <header><p class="eyebrow">DISCOVERYSTACK / INSIGHTS</p><h1>{{ copy.title }}</h1><p v-if="report" class="brand">{{ report.brandName }} <span>{{ report.domain }}</span></p></header>
    <form class="report-controls" @submit.prevent="load"><label>{{ copy.month }}<input v-model="month" type="month" :disabled="busy"></label><button :disabled="busy">{{ busy ? copy.loading : copy.show }}</button><button type="button" :disabled="!report || busy" @click="printReport">{{ copy.print }}</button><button type="button" :disabled="!report || busy" @click="download">{{ copy.csv }}</button></form>
    <p v-if="busy" role="status">{{ copy.loading }}</p>
    <p v-else-if="state !== 'idle'" role="alert">{{ state === 'not_configured' ? copy.notConfigured : copy.error }} <NuxtLink v-if="state === 'error'" to="/managed-site-access">{{ copy.back }}</NuxtLink></p>
    <template v-if="report">
      <p class="period"><bdi dir="ltr">{{ report.month }}</bdi> · {{ copy.timeZone }}: <bdi dir="ltr">{{ report.timeZone }}</bdi> · {{ report.periodComplete ? copy.complete : copy.inProgress }}</p>
      <section class="metrics" :aria-label="copy.title">
        <article><h2>{{ copy.samples }}</h2><strong>{{ report.sampleCount }}</strong></article>
        <article><h2>{{ copy.mentions }}</h2><strong><bdi>{{ rate(report.estimates.mention) }}</bdi></strong><small v-if="report.estimates.mention">{{ copy.interval }}: <bdi dir="ltr">{{ interval(report.estimates.mention) }}</bdi></small></article>
        <article><h2>{{ copy.citations }}</h2><strong><bdi>{{ rate(report.estimates.citation) }}</bdi></strong><small v-if="report.estimates.citation">{{ copy.interval }}: <bdi dir="ltr">{{ interval(report.estimates.citation) }}</bdi></small></article>
        <article><h2>{{ copy.coverage }}</h2><strong><bdi dir="ltr">{{ report.observedQueries }} / {{ report.trackedQueries }}</bdi></strong></article>
      </section>
      <aside class="limitations"><p>{{ copy.limits }}</p><p>{{ copy.unmeasured }}</p><p v-if="report.sampleCount === 0">{{ copy.unknown }} / n = {{ report.sampleCount }}</p></aside>
      <section class="outcomes"><div>{{ copy.cited }}<strong>{{ report.labels.cited }}</strong></div><div>{{ copy.mentioned }}<strong>{{ report.labels.mentioned_without_citation }}</strong></div><div>{{ copy.notMentioned }}<strong>{{ report.labels.not_mentioned }}</strong></div></section>
      <section class="breakdowns"><article><h2>{{ copy.providers }}</h2><dl><div v-for="row in report.byProvider" :key="row.provider"><dt><bdi>{{ row.provider }}</bdi></dt><dd><bdi dir="ltr">{{ row.cited }} / {{ row.sampleCount }}</bdi> {{ copy.citations }}</dd></div></dl></article><article><h2>{{ copy.locales }}</h2><dl><div v-for="row in report.byLocale" :key="row.locale"><dt><bdi>{{ row.locale }}</bdi></dt><dd><bdi dir="ltr">{{ row.cited }} / {{ row.sampleCount }}</bdi> {{ copy.citations }}</dd></div></dl></article></section>
      <section><h2>{{ copy.questions }}</h2><p v-if="report.questions.length > 25">{{ copy.truncated }}</p><div class="table-wrap"><table><thead><tr><th>{{ copy.question }}</th><th>{{ copy.sample }}</th><th>{{ copy.citation }}</th><th>{{ copy.next }}</th></tr></thead><tbody><tr v-for="(row, index) in report.questions.slice(0, 25)" :key="index"><td>{{ row.question }}<small>{{ row.locale }}</small></td><td>{{ row.sampleCount }}</td><td>{{ row.cited }}</td><td>{{ row.action === 'observe' ? copy.observe : row.action === 'improve_sources' ? copy.improve : copy.maintain }}</td></tr></tbody></table></div></section>
      <footer>{{ copy.asOf }}: <bdi dir="ltr">{{ report.asOf }}</bdi><small dir="ltr">{{ report.fingerprint }}</small></footer>
    </template>
  </main>
</template>

<style scoped>
.monthly-report{max-width:1120px;margin:auto;padding:clamp(1rem,4vw,3rem);color:#20362f;background:#fcfaf5;min-height:100vh;font-family:system-ui,sans-serif;line-height:1.6;overflow-wrap:anywhere}.eyebrow{letter-spacing:.15em;font-size:.75rem;color:#5b746a}h1{font-size:clamp(1.8rem,4vw,3.2rem);line-height:1.18;letter-spacing:-.035em;margin:.7rem 0}h2{font-size:1.05rem;font-weight:600}.brand{font-size:1.2rem}.brand span{color:#65776f;margin-inline-start:.6rem;font-size:.9rem}.report-controls{display:flex;flex-wrap:wrap;align-items:end;gap:.7rem;margin-block:1rem 2rem}.report-controls label{display:grid;gap:.25rem}button,input{font:inherit;border:1px solid #aac0b4;border-radius:.5rem;padding:.65rem .9rem;background:white;color:inherit}button{cursor:pointer}button[type=submit],button:not([type]){background:#264f40;color:white}button:disabled{opacity:.55;cursor:wait}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #997247;outline-offset:3px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}.metrics article{border:1px solid #d3dfd7;border-radius:1rem;background:#fff;padding:1.3rem}.metrics h2{margin:0;color:#607369;font-size:.9rem}.metrics strong{display:block;font-size:clamp(1.45rem,3vw,2.5rem);margin-block:.5rem}small{display:block;color:#65776f;font-size:.75rem}.limitations{background:#f0eee2;border-inline-start:3px solid #a88b53;padding:.7rem 1.2rem;margin-block:1.5rem;font-size:.9rem}.outcomes,.breakdowns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-block:1.5rem}.outcomes div{border-bottom:1px solid #c8d7ce;padding-block:.5rem}.outcomes strong{display:block;font-size:1.5rem}.breakdowns{grid-template-columns:repeat(2,minmax(0,1fr))}dl div{display:flex;justify-content:space-between;gap:.8rem;border-bottom:1px solid #e1e7e0;padding:.4rem 0}dd{margin:0}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:start;font-size:.9rem}th,td{text-align:start;padding:.8rem;border-bottom:1px solid #d6e0d8;vertical-align:top}th{color:#566c60;font-weight:600}td:first-child{min-width:12rem}footer{margin-block:2rem;color:#65776f;font-size:.8rem}footer small{font-family:monospace;margin-top:.5rem}@media(max-width:700px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.breakdowns{grid-template-columns:1fr}.outcomes{grid-template-columns:1fr}.report-controls button{flex:1}.report-controls label{width:100%}}@media print{.report-controls{display:none}.monthly-report{max-width:none;padding:0;min-height:0;background:white}.metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.metrics article{padding:.6rem;break-inside:avoid}.metrics strong{font-size:1.4rem}.limitations{background:white}.table-wrap{overflow:visible}tr,.breakdowns article{break-inside:avoid}header,section>h2{break-after:avoid}a{color:inherit;text-decoration:none}}
</style>
