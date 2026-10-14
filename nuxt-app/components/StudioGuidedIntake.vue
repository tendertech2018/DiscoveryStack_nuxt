<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { INTAKE_FIELDS, REQUIRED_INTAKE_FIELDS, type IntakeFacts, type IntakeField, type StudioIntakeReply } from '../utils/managedSiteGuided'
import { initialStudioLanguage, siteTextDirection } from '../utils/managedSiteLanguage'
import type { StudioBrief } from '../utils/managedSiteStudio'

const props = defineProps<{
  request: (method: 'GET' | 'POST', body?: Record<string, unknown>) => Promise<StudioIntakeReply>
  analyseReference: (url: string, revision: number) => Promise<StudioIntakeReply>
  saveMedia?: (body: Record<string, unknown>) => Promise<StudioIntakeReply>
  disabled?: boolean
}>()
const emit = defineEmits<{ ready: [brief: StudioBrief]; generate: [mode: 'ai' | 'template']; state: [state: { busy: boolean; ready: boolean }]; language: [language: string] }>()
const state = ref<StudioIntakeReply | null>(null)
const message = ref(''), referenceUrl = ref(''), error = ref(''), busy = ref(false), editKnown = ref(false)
const answers = ref<IntakeFacts>({})
const mediaBusy = ref(false)
const hintLanguage = ref('en')
const advancedFields = ref(false)
const analysedInput = ref('')
const language = computed(() => state.value?.revision ? state.value.language : initialStudioLanguage(message.value, hintLanguage.value))
const zh = computed(() => language.value.startsWith('zh'))
const t = (chinese: string, english: string) => zh.value ? chinese : english
const names: Record<IntakeField, [string, string]> = { brandName: ['品牌名稱', 'Brand name'], offer: ['商品／服務', 'Products or services'], audience: ['主要客群', 'Audience'], market: ['市場', 'Market'], goal: ['主要目標', 'Primary goal'], siteType: ['網站類型', 'Site type'], language: ['網站語言', 'Website language'], style: ['風格', 'Style'] }
let sequence = 0
onBeforeUnmount(() => { sequence++ })
function accept(next: StudioIntakeReply) {
  state.value = next
  if (next.revision > 0) emit('language', next.language)
  // Off-topic guidance cannot remove an already complete, unchanged server-owned brief.
  if (next.brief) emit('ready', next.brief)
}
async function includeReference(next: StudioIntakeReply, current: number) {
  const url = referenceUrl.value.trim()
  // One explicit create action includes the pasted reference. No generation on mount or reload.
  if (current !== sequence || !url || url === analysedInput.value || url === next.reference?.url) return next
  accept(next) // Intake may already have saved; retain its revision if the reference is unavailable.
  const resolved = await props.analyseReference(url, next.revision)
  if (current === sequence) analysedInput.value = url
  return resolved
}
async function run(work: () => Promise<StudioIntakeReply>) {
  if (busy.value || mediaBusy.value || props.disabled) return
  const current = ++sequence; busy.value = true; error.value = ''; emit('state', { busy: true, ready: false })
  try { const next = await work(); if (current === sequence) accept(next) }
  catch (cause: any) {
    if (current !== sequence) return
    const status = Number(cause?.statusCode || cause?.response?.status || cause?.status)
    error.value = status === 409 ? t('另一個分頁更新了需求，請按「重新讀取」，不會覆蓋你的輸入。', 'Your brief changed in another tab. Reload it; your input is preserved.') : status === 429 ? t('短時間內已請 AI 處理多次，請稍後再試；已知資料仍保留。', 'Please wait before another AI request. Your known details are preserved.') : t('這次沒有完成，原有資料沒有被覆蓋。可以重試或直接填寫重點。', 'This request did not complete. Your previous details are preserved. Retry or enter the essentials directly.')
  } finally { if (current === sequence) { busy.value = false; emit('state', { busy: false, ready: state.value?.status === 'ready' }) } }
}
async function submit(andGenerate = false) {
  if (busy.value || mediaBusy.value || props.disabled) return
  const payload = message.value.trim(); const patch = Object.fromEntries(Object.entries(answers.value).filter(([, value]) => value?.trim()))
  if (!payload && !Object.keys(patch).length) return
  const submittedSequence = sequence + 1
  let submitted: StudioIntakeReply | undefined
  await run(async () => {
    let next = await props.request('POST', { revision: state.value?.revision || 0, ...(payload ? { message: payload } : {}), ...(Object.keys(patch).length ? { answers: patch } : {}) })
    if (submittedSequence !== sequence) return next
    if (next.status !== 'off_topic') {
      message.value = ''; answers.value = {}
      next = await includeReference(next, submittedSequence)
    }
    submitted = next
    return next
  })
  // The customer's explicit create action can continue directly; mounting/reloading never invokes AI.
  if (submittedSequence === sequence && andGenerate && submitted?.status === 'ready' && submitted.brief && !error.value && !props.disabled) {
    editKnown.value = false
    emit('generate', 'ai')
  }
}
async function generateReady(mode: 'ai' | 'template') {
  if (!state.value?.brief || busy.value || mediaBusy.value || props.disabled || message.value.trim() || Object.values(answers.value).some(Boolean)) return
  const current = sequence + 1
  await run(() => includeReference(state.value!, current))
  if (current === sequence && !error.value && state.value?.brief && !props.disabled) emit('generate', mode)
}
onMounted(() => { hintLanguage.value = navigator.language; void run(() => props.request('GET')) })
</script>

<template>
  <section class="guided" :lang="language" :dir="siteTextDirection(language)" aria-label="Website brief">
    <p class="guided-eyebrow">01 / THE BRIEF</p>
    <h3>{{ t('先說想法，不必填一大張表。', 'Start with an idea, not a long form.') }}</h3>
    <p class="guided-intro">{{ t('說說你的生意、客人和想做的網站。我們會整理已知資訊，只補問還缺的重點。', 'Tell us about your business, customers and website. We will keep what you have already told us and only ask for missing details.') }}</p>
    <p v-if="state && (state.revision > 0 || state.status === 'off_topic')" class="guided-reply" role="status">{{ state.reply }}</p>
    <details v-if="state && Object.keys(state.facts).length" class="known">
      <summary>{{ t('已經知道，不會重問', 'Already known — no need to repeat') }} · {{ Object.keys(state.facts).length }}</summary>
      <dl><template v-for="(value, field) in state.facts" :key="field"><dt>{{ names[field][zh ? 0 : 1] }}</dt><dd>{{ value }}</dd></template></dl>
      <button type="button" class="quiet" :disabled="busy || disabled" @click="editKnown = !editKnown">{{ t('修正這些資料', 'Edit these details') }}</button>
    </details>
    <div v-if="state?.status !== 'ready' || editKnown" class="question-list">
      <div v-for="question in (editKnown ? (advancedFields ? INTAKE_FIELDS : REQUIRED_INTAKE_FIELDS).map(field => ({ field, prompt: names[field][zh ? 0 : 1] })) : state?.revision ? state.questions : [])" :key="question.field">
        <label :for="`intake-${question.field}`">{{ question.prompt }}</label>
        <select v-if="question.field === 'goal'" :id="`intake-${question.field}`" v-model="answers[question.field]" :disabled="busy || disabled">
          <option value="">{{ t('請選擇', 'Choose') }}</option><option value="sell_online">{{ t('直接購買', 'Buy products') }}</option><option value="increase_bookings">{{ t('預約服務', 'Book a service') }}</option><option value="increase_inquiries">{{ t('聯絡／洽詢', 'Make an enquiry') }}</option><option value="build_brand">{{ t('認識品牌', 'Explore the brand') }}</option>
        </select>
        <select v-else-if="question.field === 'siteType'" :id="`intake-${question.field}`" v-model="answers[question.field]" :disabled="busy || disabled"><option value="">{{ t('請選擇', 'Choose') }}</option><option value="one_page">{{ t('一頁式', 'Landing page') }}</option><option value="brand_blog">{{ t('品牌網站', 'Brand website') }}</option><option value="simple_commerce">{{ t('商品目錄／商店', 'Product catalogue / store') }}</option></select>
        <input v-else :id="`intake-${question.field}`" v-model="answers[question.field]" :maxlength="question.field === 'offer' ? 1800 : question.field === 'brandName' ? 160 : 360" :placeholder="state?.facts[question.field] || (question.field === 'language' ? 'en · zh-Hant · ja · fr · ar …' : '')" :disabled="busy || disabled">
      </div>
      <button v-if="editKnown" type="button" class="quiet" @click="advancedFields = !advancedFields">{{ t('市場、語言、風格等選填資料', 'Optional market, language and style details') }} {{ advancedFields ? '−' : '+' }}</button>
    </div>
    <template v-if="!state?.brief || editKnown">
    <label for="intake-message">{{ t('用你的語言告訴我', 'Tell me in your own language') }}</label>
    <textarea id="intake-message" v-model="message" rows="4" maxlength="2200" :disabled="busy || disabled" :placeholder="t('例如：我們叫 ÉCLAT，賣精品飾品，想服務法國喜歡簡約設計的女性，網站要能讓客人選購商品。', 'For example: We are ÉCLAT, a jewellery brand for women in France who love minimal design. We want a website where customers can explore and buy our pieces.')"></textarea>
    <p class="small">{{ t('只填可公開資料。用 AI 整理需求或產生網站會使用你方案的 AI 額度；直接填寫欄位與分析參考風格不呼叫 AI。', 'Use public information only. AI planning and generation use AI credits. Direct field entry and reference-style analysis do not call an AI model.') }}</p>
    </template>
    <div class="reference-input">
      <label for="intake-reference">{{ t('貼上你喜歡的網站（選填）', 'Paste a website you love (optional)') }}</label>
      <input id="intake-reference" v-model="referenceUrl" type="url" maxlength="2048" placeholder="https://example.com" :disabled="busy || mediaBusy || disabled">
      <p class="small">{{ t('按建立時一起分析色調、字體風格與版面，不必多按一步。不搬用對方圖片、商標或付費字體。', 'We analyse its palette, typography style and layout when you create — no extra step. Source images, logos and paid fonts are not copied.') }}</p>
      <div v-if="state?.reference" class="reference-result">
        <p>{{ state.reference.status === 'partial' ? t('已取得部分設計特徵', 'Some design characteristics available') : t('參考風格已加入提案', 'Reference style added to your brief') }}</p>
        <div class="swatches"><span v-for="color in state.reference.palette" :key="color" :style="{ background: color }" :title="color"></span></div>
        <p v-if="state.reference.fonts.length" class="small">{{ state.reference.fonts.join(' · ') }}</p>
        <p class="small">{{ t('參考的是設計特徵，不保證逐像素複製；精確字體與動畫仍需另外確認。', 'Design inspiration, not a pixel-identical copy. Exact fonts and animation fidelity need separate review.') }}</p>
      </div>
    </div>
    <template v-if="!state?.brief || editKnown">
    <button class="primary" type="button" :disabled="busy || mediaBusy || disabled || (!message.trim() && !Object.values(answers).some(Boolean))" @click="submit(true)">{{ busy ? t('正在整理需求與參考…', 'Preparing your brief and reference…') : t('幫我建立網站 →', 'Create my website →') }}</button>
    <p class="small">{{ t('資料足夠就直接產生提案；有缺漏才補問。', 'Enough detail? We create the proposal directly. Otherwise, we only ask for what is missing.') }}</p>
    <button v-if="!editKnown" type="button" class="quiet" :disabled="busy || disabled" @click="editKnown = true">{{ t('不用 AI，直接填重點', 'Enter essentials without AI') }}</button>
    <button v-else type="button" class="quiet" :disabled="busy || disabled" @click="submit(false)">{{ t('只儲存資料，先不生成', 'Save details without generating') }}</button>
    </template>
    <details class="reference">
      <summary>{{ t('加入自己的品牌照片（選填）', 'Add your brand photographs (optional)') }} <span aria-hidden="true">＋</span></summary>
    <StudioBrandImages v-if="saveMedia && state" :media="state.media" :revision="state.revision" :language="language" :save="saveMedia" :disabled="busy || disabled" @saved="accept" @busy="mediaBusy = $event; emit('state', { busy: $event, ready: state?.status === 'ready' })" />
    </details>
    <div v-if="state?.brief" class="ready">
      <p>{{ t('重點齊了，現在先看完整提案。', 'Your brief is ready. See your full proposal.') }}</p>
      <button type="button" class="primary" :disabled="busy || mediaBusy || disabled || message.trim().length > 0 || Object.values(answers).some(Boolean)" @click="generateReady('ai')">{{ t('產生 AI 網站提案', 'Generate my AI website') }} ↗</button>
      <button type="button" class="quiet" :disabled="busy || mediaBusy || disabled || message.trim().length > 0 || Object.values(answers).some(Boolean)" @click="generateReady('template')">{{ t('先看免 AI 排版', 'Preview layout without AI') }}</button>
      <p class="small">{{ t('這一步不付款、不買網域、不發布；購物與預約要在功能設定及實測完成後才能上線。', 'No payment, domain purchase or publication occurs now. Commerce and booking must be configured and tested before activation.') }}</p>
    </div>
    <p v-if="error" role="alert">{{ error }} <button type="button" class="quiet" :disabled="busy || disabled" @click="run(() => request('GET'))">{{ t('重新讀取', 'Reload brief') }}</button></p>
  </section>
</template>

<style scoped>
.guided{min-width:0}.guided h3{font-size:1.5rem;line-height:1.35;margin:.5rem 0 1rem}.guided-intro,.small{line-height:1.7;opacity:.75}.guided-eyebrow{font-size:.65rem;letter-spacing:.15em}.guided label{display:block;font-size:.8rem;margin:1.2rem 0 .5rem}.guided input,.guided textarea,.guided select{box-sizing:border-box;display:block;width:100%;min-width:0;padding:.85rem;color:inherit;background:transparent;border:1px solid #b7a88f66;border-radius:0;font:inherit}.guided select option{color:#171a32;background:#eee9df}.guided textarea{resize:vertical}.guided button{font:inherit;min-height:44px;cursor:pointer}.primary{width:100%;background:#e6dfd1;color:#171a32;border:0;padding:1rem;margin:.7rem 0}.quiet{background:none;color:inherit;border:0;border-bottom:1px solid #b7a88f66;padding:.5rem 0;margin:.5rem 1rem .5rem 0;text-align:start}.guided button:disabled{opacity:.45;cursor:wait}.small{font-size:.72rem}.known,.guided-reply,.reference-result{border-inline-start:2px solid #b7a88f;padding:.8rem 1rem;margin:1.5rem 0;background:#b7a88f09}.known>p{font-size:.75rem}.known dl{display:grid;grid-template-columns:minmax(0,.4fr) minmax(0,1fr);gap:.65rem;font-size:.8rem}.known dd{margin:0;overflow-wrap:anywhere}.known dt{opacity:.6}.reference,.ready{border-top:1px solid #b7a88f44;margin-top:2rem;padding-top:1.5rem}.reference h4{font-size:1.1rem;margin:.7rem 0}.swatches{display:flex;gap:.5rem;flex-wrap:wrap}.swatches span{width:1.8rem;height:1.8rem;border-radius:50%;border:1px solid #b7a88f66}:focus-visible{outline:2px solid #b7a88f;outline-offset:4px}
</style>
