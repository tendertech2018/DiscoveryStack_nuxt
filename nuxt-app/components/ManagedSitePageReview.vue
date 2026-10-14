<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { managedSitePageReviewCopy, type ManagedSitePageReview } from '../utils/managedSitePageReview'
import { htmlSiteLanguage, siteTextDirection } from '../utils/managedSiteLanguage'

const props = defineProps<{ pageId: string; pageVersion: number; locale: string; request: (path: `/api/managed-sites/editor/${string}`, options: { method: 'POST'; body: Record<string, unknown> }) => Promise<ManagedSitePageReview> }>()
const report = ref<ManagedSitePageReview | null>(null), busy = ref(false), failed = ref(false)
const copy = computed(() => managedSitePageReviewCopy(props.locale))
let sequence = 0
watch(() => [props.pageId, props.pageVersion], () => { sequence++; report.value = null; busy.value = false; failed.value = false })
onBeforeUnmount(() => { sequence++ })
async function review() {
  if (busy.value) return
  const request = ++sequence, pageId = props.pageId, pageVersion = props.pageVersion
  busy.value = true; failed.value = false; report.value = null
  try {
    const result = await props.request(`/api/managed-sites/editor/pages/${encodeURIComponent(pageId)}/preflight`, { method: 'POST', body: { expectedPageVersion: pageVersion } })
    if (request !== sequence) return
    if (result.pageId !== pageId || result.pageVersion !== pageVersion) throw new Error('Stale review')
    report.value = result
  } catch { if (request === sequence) failed.value = true }
  finally { if (request === sequence) busy.value = false }
}
</script>

<template>
  <section class="page-review" :lang="htmlSiteLanguage(locale)" :dir="siteTextDirection(locale)">
    <h2>{{ copy.title }}</h2>
    <button type="button" :disabled="busy" @click="review">{{ busy ? copy.checking : copy.check }}</button>
    <p v-if="failed" role="alert">{{ copy.error }}</p>
    <template v-if="report">
      <p class="review-status" role="status">{{ report.technicalStatus === 'blocked' ? copy.blocked : copy.passed }} · v{{ report.pageVersion }}</p>
      <p>{{ copy.checked }}</p>
      <ul v-if="report.findings.length"><li v-for="(finding, index) in report.findings" :key="index" :class="{ blocking: finding.severity === 'blocking' }">{{ copy[finding.code] }}</li></ul>
      <p class="review-limits">{{ copy.limits }}</p>
      <details v-if="report.comparison"><summary>{{ copy.comparison }} {{ report.comparison.fromVersion }} → {{ report.comparison.toVersion }}</summary>
        <p v-if="report.comparison.seoChanged">{{ copy.metadata }}</p><p v-if="report.comparison.designChanged">{{ copy.design }}</p>
        <article v-for="change in report.comparison.changes" :key="change.blockId"><h3>{{ copy[change.kind] }} · {{ change.blockId }}</h3>
          <p v-if="change.before === change.after">{{ copy.unchanged }}</p>
          <template v-else><div v-if="change.before !== null"><strong>{{ copy.before }}</strong><p class="before">{{ change.before }}</p></div><div v-if="change.after !== null"><strong>{{ copy.after }}</strong><p class="after">{{ change.after }}</p></div></template>
        </article>
      </details>
      <p v-else>{{ copy.initial }}</p>
    </template>
  </section>
</template>

<style scoped>
.page-review{padding:1rem;border:1px solid #d7ded7;border-radius:.8rem;margin-block:1rem;background:#fafbf8;line-height:1.6;overflow-wrap:anywhere}.page-review h2{font-size:1rem}.page-review h3{font-size:.85rem}.page-review p,.page-review li{font-size:.85rem}.page-review button{font:inherit;padding:.65rem .8rem;background:#234d3d;color:white;border:0;border-radius:.4rem;width:100%;cursor:pointer}.page-review button:disabled{opacity:.55;cursor:wait}.page-review button:focus-visible,.page-review summary:focus-visible{outline:3px solid #ad874d;outline-offset:3px}.review-status{font-weight:600}.review-limits{color:#655931;border-inline-start:3px solid #ba9c57;padding-inline-start:.6rem}.blocking{color:#a02d27}.page-review article{border-top:1px solid #d7ded7;margin-top:.7rem}.page-review article p{white-space:pre-wrap;padding:.5rem}.before{background:#faece9}.after{background:#e8f2eb}summary{cursor:pointer}
</style>
