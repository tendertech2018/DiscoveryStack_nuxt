<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DraftAdviceResponse } from '../types/draft-advice'
import { draftAdviceErrorMessage, parseDraftAdviceResponse } from '../utils/draftAdvice'

const props = defineProps<{
  entries: Array<{ id: number; draftId: number | null; topicCluster: string; status: string }>
  models: Array<{ artifactId: string; status: string; fallbackOnly: boolean; taskType: string }>
  loadError?: boolean
}>()
const entryId = ref(0), artifactId = ref(''), contextFingerprint = ref('')
const result = ref<DraftAdviceResponse | null>(null), error = ref(''), busy = ref(false)
const fetchAdvice = $fetch as unknown as (path: string, options: { method: 'POST'; retry: 0; body: { entryId: number; artifactId: string; contextFingerprint?: string } }) => Promise<unknown>
const drafts = computed(() => props.entries.filter(entry => entry.draftId))
const models = computed(() => props.models.filter(model => model.status === 'approved_for_shadow' && !model.fallbackOnly && model.taskType === 'citation_selection'))
let revision = 0
function invalidate() { revision++; result.value = null; error.value = ''; contextFingerprint.value = ''; busy.value = false }
watch([entryId, artifactId, () => props.entries, () => props.models, () => props.loadError], invalidate, { deep: true, flush: 'sync' })
const canRequest = computed(() => !busy.value && !props.loadError && drafts.value.some(row => row.id === entryId.value) && models.value.some(row => row.artifactId === artifactId.value) && (result.value?.status !== 'context_required' || result.value.contexts.some(row => row.fingerprint === contextFingerprint.value)))
async function requestAdvice() {
  if (!canRequest.value) return
  const requestRevision = ++revision
  const selectedEntry = entryId.value, selectedContext = contextFingerprint.value
  busy.value = true; error.value = ''; result.value = null
  try {
    const value = await fetchAdvice('/api/interventions/closed-loop/draft-advice', { method: 'POST', retry: 0, body: { entryId: selectedEntry, artifactId: artifactId.value, ...(selectedContext ? { contextFingerprint: selectedContext } : {}) } })
    if (revision !== requestRevision) return
    const parsed = parseDraftAdviceResponse(value)
    if (!parsed || parsed.entryId !== selectedEntry || parsed.status === 'ready' && selectedContext && parsed.representedContext.fingerprint !== selectedContext) throw new Error('INVALID_ADVICE_RESPONSE')
    result.value = parsed
  } catch (failure) {
    if (revision === requestRevision) { result.value = null; contextFingerprint.value = ''; error.value = draftAdviceErrorMessage(failure) }
  } finally { if (revision === requestRevision) busy.value = false }
}
</script>

<template>
  <section class="draft-advice" aria-label="目前草稿的模型建議">
    <h2>只給建議，由你決定是否修改</h2>
    <p>讀取同一份草稿與核准的影子模型，不改文章、不發布、不開啟訓練。不同模型或情境的分數不能用來替文章排名。</p>
    <p v-if="loadError" role="alert">目前無法讀取草稿或模型，請先確認服務與權限。</p>
    <p v-else-if="!drafts.length || !models.length">需要完整草稿及已核准的引用影子模型。沒有資料時不會用示範分數代替。</p>
    <form @submit.prevent="requestAdvice">
      <label>目前草稿<select v-model.number="entryId"><option :value="0">選擇草稿</option><option v-for="entry in drafts" :key="entry.id" :value="entry.id">#{{ entry.id }} · {{ entry.topicCluster }}</option></select></label>
      <label>已核准影子模型<select v-model="artifactId"><option value="">選擇模型</option><option v-for="model in models" :key="model.artifactId" :value="model.artifactId">{{ model.artifactId }}</option></select></label>
      <template v-if="result?.status === 'context_required'">
        <p>資料包含多個相同語言的情境。請選擇要檢視的假設情境；這不代表目前文章已被該引擎觀測。</p>
        <label>評估情境<select v-model="contextFingerprint"><option value="">請選擇</option><option v-for="context in result.contexts" :key="context.fingerprint" :value="context.fingerprint">{{ context.engine }} · {{ context.model }} · {{ context.modelVersion || '版本未知' }} · {{ context.interface }} · {{ context.locale }} · {{ context.region || '地區未知' }}（{{ context.memberCount }} 筆）</option></select></label>
      </template>
      <button type="submit" :disabled="!canRequest">{{ busy ? '正在核對草稿與授權…' : result?.status === 'context_required' ? '檢視所選情境的建議' : '讀取這份草稿的建議' }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="result?.status === 'ready'" aria-live="polite">
      <h3>這份草稿可以先檢查的事</h3>
      <p>以下是草稿結構與缺漏資訊的人工檢查清單，不是模型已證明的改善效果。</p>
      <article v-for="suggestion in result.reviewSuggestions" :key="suggestion.id" class="suggestion">
        <strong>{{ suggestion.priority === 'check_first' ? '先核對' : '再檢查' }} · {{ suggestion.title }}</strong><p>{{ suggestion.explanation }}</p>
      </article>
      <p v-if="!result.reviewSuggestions.length">目前沒有這組檢查規則指出的項目；這不代表文章品質或效果已獲保證。</p>
      <h3>模型在什麼條件下評估</h3>
      <p>{{ result.representedContext.engine }} · {{ result.representedContext.model }} · {{ result.representedContext.modelVersion || '版本未知' }} · {{ result.representedContext.interface }} · {{ result.representedContext.locale }} · {{ result.representedContext.region || '地區未知' }}</p>
      <p>{{ result.contextSource === 'owner_selected_dataset_context' ? '你選擇的資料集情境' : '資料集中唯一符合草稿語言的情境' }}；不是這份草稿的實際觀測。</p>
      <p>模型實驗分數：{{ result.experimentalScore.toFixed(3) }}。不是引用成功機率、搜尋排名或跨篇優先順序。</p>
      <p>尚有 {{ result.missingFeatureList.length }} 項未知特徵，系統沒有猜測補齊。</p>
      <details><summary>查看模型訊號與版本來源</summary>
        <p>草稿 #{{ result.draftId }} · 版本 {{ result.draftVersion }}</p>
        <dl><dt>文章雜湊</dt><dd>{{ result.contentHash }}</dd><dt>模型雜湊</dt><dd>{{ result.modelArtifactHash }}</dd><dt>資料集雜湊</dt><dd>{{ result.datasetManifestHash }}</dd><dt>情境雜湊</dt><dd>{{ result.representedContext.fingerprint }}</dd><dt>建議雜湊</dt><dd>{{ result.adviceFingerprint }}</dd></dl>
        <p>特徵貢獻只解釋模型計算，不是「修改這項就有效」的因果證明。</p>
        <ul><li v-for="feature in result.featureContributions" :key="feature.key">{{ feature.key }}：{{ feature.contribution.toFixed(4) }}</li></ul>
        <p>未知特徵：{{ result.missingFeatureList.join('、') || '無' }}</p>
      </details>
      <p>結果只對這份草稿與此刻授權有效；修改後須重新檢查。所有修改與發布仍由你另行決定。</p>
    </div>
  </section>
</template>

<style scoped>
.draft-advice{padding:1.5rem;border:1px solid #cad3c9;border-radius:12px;background:#f8f6ef;line-height:1.7}.draft-advice form{display:grid;gap:1rem}.draft-advice label{display:grid;gap:.4rem}.draft-advice select{width:100%;min-width:0;padding:.6rem}.draft-advice button{justify-self:start;max-width:100%;padding:.7rem 1rem}.draft-advice [role=alert]{color:#9b2929}.suggestion{padding:1rem;margin:.8rem 0;background:#fff;border-left:3px solid #526e59}.draft-advice dd{margin-left:0;overflow-wrap:anywhere}.draft-advice li{overflow-wrap:anywhere}
</style>
