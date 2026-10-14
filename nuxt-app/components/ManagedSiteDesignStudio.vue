<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { StudioIntakeReply } from '../utils/managedSiteGuided'
import { journeyText } from '../utils/managedSiteJourneyCopy'
import { siteTextDirection } from '../utils/managedSiteLanguage'
import type { StudioDesign } from '../utils/managedSitePresentation'
import {
  STUDIO_DIRECTIONS,
  studioBriefKey,
  type StudioBrief,
  type StudioPageKey,
  type StudioPreset,
  type StudioPreview,
  type StudioPreviewRequest,
  type StudioSelection,
} from '../utils/managedSiteStudio'

const props = defineProps<{
  initial?: Partial<StudioBrief>
  draft?: StudioSelection | null
  confirmed?: { proposalId: string; preset: StudioPreset } | null
  requestPreview: (input: StudioPreviewRequest) => Promise<StudioPreview>
  requestIntake?: (method: 'GET' | 'POST', body?: Record<string, unknown>) => Promise<StudioIntakeReply>
  analyseReference?: (url: string, revision: number) => Promise<StudioIntakeReply>
  saveMedia?: (body: Record<string, unknown>) => Promise<StudioIntakeReply>
  interfaceLanguage?: string
  requestDesign?: (proposalId: string, design: Partial<StudioDesign>) => Promise<StudioPreview>
  saving?: boolean
  saveError?: string
}>()
const emit = defineEmits<{
  continue: [selection: StudioSelection]
  detailed: [brief: StudioBrief, draft?: StudioSelection]
}>()
const brief = ref<StudioBrief>({
  brandName: '',
  brief: '',
  siteType: 'brand_blog',
  goal: 'increase_inquiries',
  ...props.initial,
})
// Returning from the wizard restores the current proposal only when its brief still matches.
// The parent restores a server-owned proposal; no HTML, model context or private data enters browser storage.
const restored =
  props.draft &&
  studioBriefKey(props.draft.brief) === studioBriefKey(brief.value)
    ? props.draft
    : null
const result = ref<StudioPreview | null>(restored?.preview || null)
const renderedBrief = ref<StudioBrief | null>(
  restored ? { ...restored.brief } : null
)
const selectedPreset = ref<StudioPreset>(restored?.preset || 'atelier')
const showGuided = ref(!restored)
const intakeBusy = ref(false)
const editAllPages = ref(false)
const customAccent = ref(''), customCanvas = ref('')
const conversationLanguage = computed(() => props.interfaceLanguage || brief.value.language || 'zh-Hant')
const zh = computed(() => conversationLanguage.value.startsWith('zh'))
const t = (chinese: string, english: string) => zh.value ? chinese : english
function acceptGuidedBrief(next: StudioBrief) { brief.value = { ...next } }
function guidanceMessage(cause: any): string | null {
  const data = cause?.data?.data || cause?.data
  return data?.code === 'STUDIO_GUIDANCE' && typeof data.message === 'string' ? data.message.slice(0, 1600) : null
}
const mobile = ref(false)
const busy = ref(false)
const error = ref('')
const revision = ref('')
const pending = ref<{
  preview: StudioPreview
  instruction: string
  briefKey: string
} | null>(null)
const previewView = ref<'before' | 'after'>('after')
const currentPage = ref<StudioPageKey>('home')
const busyPurpose = ref('')
const notice = ref('')
const revisionInput = ref<HTMLTextAreaElement | null>(null)
const history = ref<
  Array<{ brief: StudioBrief; result: StudioPreview; preset: StudioPreset }>
>([])
const resultHeading = ref<HTMLElement | null>(null)
let requestSequence = 0
onBeforeUnmount(() => {
  requestSequence += 1
})

const dirty = computed(
  () =>
    !renderedBrief.value ||
    studioBriefKey(brief.value) !== studioBriefKey(renderedBrief.value) ||
    Boolean(revision.value.trim())
)
const briefChanged = computed(
  () =>
    !renderedBrief.value ||
    studioBriefKey(brief.value) !== studioBriefKey(renderedBrief.value)
)
const visibleResult = computed(() =>
  pending.value && previewView.value === 'after'
    ? pending.value.preview
    : result.value
)
const designDirections = computed(() => !visibleResult.value?.design ? STUDIO_DIRECTIONS : [
  { key: 'atelier' as const, label: t('品牌主提案', 'Brand direction'), note: t('依需求與參考風格安排', 'Your brief and reference style') },
  { key: 'bloom' as const, label: t('大圖敘事', 'Visual showcase'), note: t('寬幅圖片與交錯內容', 'Wide imagery and editorial sections') },
  { key: 'alignment' as const, label: t('清楚俐落', 'Structured clarity'), note: t('置中主視覺與資訊卡片', 'Centred hero and content cards') },
])
const showingConfirmed = computed(() => Boolean(
  props.confirmed &&
  result.value?.proposalId === props.confirmed.proposalId &&
  selectedPreset.value === props.confirmed.preset &&
  !dirty.value && !pending.value
))
const availablePages = computed(
  () =>
    visibleResult.value?.pages || [
      {
        key: 'home' as const,
        label: '首頁',
        designs: visibleResult.value?.designs || [],
      },
    ]
)
const selectedDesign = computed(() =>
  (
    availablePages.value.find(page => page.key === currentPage.value) ||
    availablePages.value[0]
  )?.designs.find(item => item.preset === selectedPreset.value)
)
const canContinue = computed(() =>
  Boolean(
    result.value &&
      selectedDesign.value &&
      !dirty.value &&
      !busy.value &&
      !props.saving &&
      !pending.value
      && !intakeBusy.value && (!props.requestIntake || !showGuided.value)
      && (!props.requestIntake || result.value?.source === 'llm')
  )
)
const canApply = computed(() =>
  Boolean(
    pending.value &&
      pending.value.briefKey === studioBriefKey(brief.value) &&
      pending.value.instruction === revision.value.trim() &&
      !busy.value &&
      !props.saving
  )
)
const examples = [
  {
    label: '服務／預約',
    brandName: '日光工作室',
    brief:
      '我們在台中提供小班瑜伽，希望初學者能先了解課程、常見問題，再預約體驗。語氣自然親切。',
    siteType: 'brand_blog',
    goal: 'increase_bookings',
  },
  {
    label: '品牌／顧問',
    brandName: '原點設計',
    brief:
      '我們協助小型品牌設計識別與包裝。網站要說清楚服務與合作流程，讓有需求的人來信詢問。',
    siteType: 'one_page',
    goal: 'increase_inquiries',
  },
  {
    label: '商品／商店',
    brandName: '山間選物',
    brief:
      '販售日常陶器與咖啡用品，想要清楚的商品分類、品牌故事與購物入口。商品與價格之後會提供真實資料。',
    siteType: 'simple_commerce',
    goal: 'sell_online',
  },
] satisfies Array<StudioBrief & { label: string }>

function useExample(example: (typeof examples)[number]) {
  if (busy.value || brief.value.brandName.trim() || brief.value.brief.trim())
    return
  brief.value = {
    brandName: example.brandName,
    brief: example.brief,
    siteType: example.siteType,
    goal: example.goal,
  }
}

async function generate(mode: 'template' | 'ai' = 'template') {
  if (busy.value || intakeBusy.value || props.saving || pending.value) return
  error.value = ''
  notice.value = ''
  if (revision.value.trim()) {
    error.value =
      t('下方有尚未處理的修改要求，請先看修改建議，或清除要求後重新產生。', 'Review or clear your pending edit request before generating another proposal.')
    return
  }
  const description = brief.value.brief.trim()
  if (
    !brief.value.brandName.trim() ||
    !description ||
    brief.value.brandName.trim().length > 160 ||
    description.length > 1800
  ) {
    error.value = t('請填寫品牌名稱與需求；品牌最多 160 字，需求最多 1,800 字。', 'Enter your brand name and brief, within 160 and 1,800 characters respectively.')
    return
  }
  const snapshot = {
    ...brief.value,
    brandName: brief.value.brandName.trim(),
    brief: description,
  }
  const sequence = ++requestSequence
  busy.value = true
  busyPurpose.value =
    mode === 'ai'
      ? t('AI 正在規劃網站與撰寫各頁文案，可能需要一點時間…', 'AI is planning your website and writing each page. This may take a moment…')
      : t('正在準備版型與頁面預覽…', 'Preparing your layout previews…')
  try {
    const next = await props.requestPreview({ ...snapshot, mode })
    if (sequence !== requestSequence) return
    validatePreview(next)
    rememberCurrent()
    if (!result.value && next.strategy?.source === 'llm')
      selectedPreset.value = next.strategy.recommendedPreset
    result.value = next
    showGuided.value = false
    brief.value = { ...snapshot }
    renderedBrief.value = { ...snapshot }
    revision.value = ''
    currentPage.value = 'home'
    await nextTick()
    focusResult()
  } catch (cause: any) {
    if (sequence !== requestSequence) return
    error.value = guidanceMessage(cause) || (
      Number(cause?.statusCode || cause?.status || cause?.response?.status) ===
      429
        ? t('這幾分鐘已產生多次預覽，請稍後再試。現有版型仍可切換。', 'Please wait before another AI request. Your existing layouts are still available.')
        : t('這次未能產生預覽，原本的版本與輸入都還在。請稍後再試。', 'The request did not complete. Your existing version and input are preserved. Please retry.'))
  } finally {
    if (sequence === requestSequence) busy.value = false
  }
}

function validatePreview(next: StudioPreview) {
  const validDesigns = (designs: StudioPreview['designs']) =>
    STUDIO_DIRECTIONS.every(direction =>
      designs?.some(
        design =>
          design.preset === direction.key &&
          typeof design.html === 'string' &&
          design.html
      )
    )
  if (
    !validDesigns(next.designs) ||
    (next.pages &&
      (!next.pages.length ||
        next.pages[0]?.key !== 'home' ||
        new Set(next.pages.map(page => page.key)).size !== next.pages.length ||
        next.pages.some(page => !validDesigns(page.designs))))
  )
    throw new Error('incomplete preview')
}

async function refineDesign(design: Partial<StudioDesign>) {
  if (busy.value || intakeBusy.value || props.saving || pending.value || dirty.value || !result.value?.proposalId || !props.requestDesign) return
  const sequence = ++requestSequence
  busy.value = true; error.value = ''; busyPurpose.value = t('正在更新外觀，不使用 AI 額度…', 'Updating the design without AI credits…')
  try {
    const updated = await props.requestDesign(result.value.proposalId, design)
    if (sequence !== requestSequence) return
    validatePreview(updated)
    // A colour/font/motion edit must keep the customer's selected layout as well as their copy.
    rememberCurrent(); result.value = updated; customAccent.value = ''; customCanvas.value = ''
    notice.value = t('外觀已更新；文字、圖片與其他內容沒有改動。可復原，確認前不會發布。', 'Design updated. Copy and images are unchanged. You can undo; nothing is published.')
  } catch { if (sequence === requestSequence) error.value = t('外觀未更新，原版本仍保留。請稍後再試。', 'The visual change was not saved. Your previous version is preserved.') }
  finally { if (sequence === requestSequence) busy.value = false }
}

function rememberCurrent() {
  if (result.value && renderedBrief.value)
    history.value = [
      ...history.value.slice(-4),
      {
        brief: { ...renderedBrief.value },
        result: result.value,
        preset: selectedPreset.value,
      },
    ]
}

async function suggestRevision(instruction: string) {
  if (busy.value || props.saving || pending.value) return
  revision.value = instruction
  await nextTick()
  revisionInput.value?.focus()
}

async function proposeRevision() {
  if (busy.value || intakeBusy.value || props.saving || pending.value) return
  error.value = ''
  notice.value = ''
  if (briefChanged.value) {
    error.value = t('品牌需求已改變，請先清除修改要求並重新產生，再修改文案。', 'Your brief changed. Clear this edit and generate the updated proposal first.')
    return
  }
  if (!result.value?.editContext || !renderedBrief.value) {
    error.value = t('請先產生新版網站提案，再使用一句話修改。', 'Generate a website proposal before requesting an edit.')
    return
  }
  const instruction = revision.value.trim()
  if (!instruction || instruction.length > 600) {
    error.value = t('請用 600 字以內，告訴我想修改哪裡。', 'Describe your change in 600 characters or fewer.')
    return
  }
  const snapshot = { ...renderedBrief.value }
  const sequence = ++requestSequence
  busy.value = true
  busyPurpose.value = t('AI 正在準備修改提案；目前的草稿不會被覆蓋…', 'Preparing the proposed edit. Your current draft will not be overwritten…')
  try {
    const next = await props.requestPreview({
      ...snapshot,
      mode: 'ai',
      revision: { instruction, base: result.value.editContext, ...(result.value.proposalId ? { proposalId: result.value.proposalId } : {}), ...(props.requestIntake && !editAllPages.value ? { pageKey: currentPage.value } : {}) },
    })
    if (sequence !== requestSequence) return
    validatePreview(next)
    if (
      next.source !== 'llm' ||
      !next.editContext ||
      !Array.isArray(next.changes)
    )
      throw new Error('unavailable edit')
    if (!next.changes.length) {
      notice.value =
        t('這次沒有產生文字差異，原稿保持不變。可以換個更具體的說法。', 'No text changed. Your draft is unchanged; try a more specific request.')
      return
    }
    pending.value = {
      preview: next,
      instruction,
      briefKey: studioBriefKey(snapshot),
    }
    previewView.value = 'after'
    await nextTick()
    focusResult()
  } catch (cause: any) {
    if (sequence !== requestSequence) return
    error.value = guidanceMessage(cause) || (
      Number(cause?.statusCode || cause?.status || cause?.response?.status) ===
      429
        ? t('這幾分鐘已產生多次預覽，請稍後再試。原稿與修改要求都保留著。', 'Please wait before another AI request. Your draft and edit instruction are preserved.')
        : t('AI 這次未能完成修改，原稿與修改要求都保留著。請稍後再試。', 'AI could not complete this edit. Your draft and instruction are preserved. Please retry.'))
  } finally {
    if (sequence === requestSequence) busy.value = false
  }
}

function focusResult() {
  resultHeading.value?.focus({ preventScroll: true })
  if (
    resultHeading.value &&
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 850px)').matches
  ) {
    resultHeading.value.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }
}

function applyRevision() {
  if (!canApply.value || !pending.value) return
  rememberCurrent()
  result.value = pending.value.preview
  pending.value = null
  revision.value = ''
  error.value = ''
  notice.value = t('修改已套用到這份草稿，沒有發布。也可以隨時回到上一版。', 'Changes applied to this draft, not published. You can return to the previous version.')
  void nextTick().then(focusResult)
}

function discardRevision() {
  if (busy.value || props.saving) return
  pending.value = null
  notice.value = t('保留原稿；修改要求仍在，可以換個說法再試。', 'Original draft kept. Your edit instruction is still available to refine.')
}

function undo() {
  if (busy.value || props.saving || pending.value) return
  const previous = history.value.at(-1)
  if (!previous) return
  customAccent.value = ''; customCanvas.value = ''
  history.value = history.value.slice(0, -1)
  brief.value = { ...previous.brief }
  renderedBrief.value = { ...previous.brief }
  result.value = previous.result
  selectedPreset.value = previous.preset
  revision.value = ''
  error.value = ''
  currentPage.value = 'home'
  notice.value = t('已回到上一版草稿。', 'Returned to the previous draft.')
}

function continueWithDesign() {
  if (!canContinue.value || !result.value || !renderedBrief.value) return
  emit('continue', {
    brief: { ...renderedBrief.value },
    preset: selectedPreset.value,
    preview: result.value,
  })
}

function openDetailed() {
  if (busy.value || intakeBusy.value || props.saving || pending.value) return
  const cached =
    result.value && renderedBrief.value
      ? {
          brief: { ...renderedBrief.value },
          preset: selectedPreset.value,
          preview: result.value,
        }
      : undefined
  emit('detailed', { ...brief.value }, cached)
}
</script>

<template>
  <section
    class="design-studio"
    aria-labelledby="design-studio-title"
    :aria-busy="busy || intakeBusy || saving"
    :lang="conversationLanguage"
    :dir="siteTextDirection(conversationLanguage)"
  >
    <ol class="studio-flow"><li :aria-current="showGuided ? 'step' : undefined">01 {{ journeyText(conversationLanguage, 'idea') }}</li><li :aria-current="!showGuided ? 'step' : undefined">02 {{ journeyText(conversationLanguage, 'review') }}</li><li>03 {{ journeyText(conversationLanguage, 'launch') }}</li></ol>
    <div class="design-studio__intro">
      <p class="studio-kicker">YOUR IDEA. A WEBSITE WITH A PLAN.</p>
      <h2 id="design-studio-title">{{ t('你說想法，', 'Your idea,') }}<em>{{ t('網站先替你想一步。', 'thoughtfully made.') }}</em></h2>
      <p>
        {{ t('不只選版型。從品牌主張、訪客動線到每頁文案，先看提案，再用一句話調整。', 'From brand story to visitor journey and every page. See the proposal, then refine it in your own words.') }}
      </p>
    </div>
    <div class="design-studio__layout">
      <form class="studio-brief" @submit.prevent="!requestIntake && generate('ai')">
        <StudioGuidedIntake v-if="requestIntake && analyseReference && showGuided" :request="requestIntake" :analyse-reference="analyseReference" :save-media="saveMedia" :disabled="busy || saving || Boolean(pending)" @ready="acceptGuidedBrief" @generate="generate" @state="intakeBusy = $event.busy" />
        <div v-else-if="requestIntake" class="studio-help">
          <p>{{ brief.brandName }} · {{ brief.language }}</p><p>{{ brief.audience }}</p>
          <button type="button" :disabled="busy || saving || Boolean(pending)" @click="showGuided = true">{{ t('調整需求、語言或參考風格', 'Refine brief, language or reference style') }} ↗</button>
        </div>
        <fieldset v-if="!requestIntake" :disabled="busy || saving || Boolean(pending)">
          <legend>01 / 說說你的生意</legend>
          <div
            v-if="!brief.brandName.trim() && !brief.brief.trim()"
            class="studio-examples"
            aria-label="試填範例"
          >
            <button
              v-for="example in examples"
              :key="example.label"
              type="button"
              @click="useExample(example)"
            >
              {{ example.label }} ↗
            </button>
          </div>
          <label for="studio-brand"
            >品牌名稱<input
              id="studio-brand"
              v-model="brief.brandName"
              maxlength="160"
              required
              autocomplete="organization"
              placeholder="你的品牌或公司名稱"
          /></label>
          <label for="studio-brief"
            >你做什麼？希望網站幫你什麼忙？<textarea
              id="studio-brief"
              v-model="brief.brief"
              maxlength="1800"
              required
              rows="5"
              placeholder="例如：在台北開咖啡店，想介紹菜單與空間，讓客人預約包場。"
            ></textarea>
          </label>
          <p class="studio-help">
            只填可公開的品牌資料，不要填密碼、客戶名單或機密資訊。
          </p>
          <details class="studio-preferences">
            <summary>網站要幫你達成什麼？</summary>
            <div class="studio-fields">
              <label for="studio-type"
                >網站用途<select id="studio-type" v-model="brief.siteType">
                  <option value="one_page">一頁式介紹</option>
                  <option value="brand_blog">品牌與內容</option>
                  <option value="simple_commerce">商品與商店</option>
                </select></label
              >
              <label for="studio-goal"
                >主要目標<select id="studio-goal" v-model="brief.goal">
                  <option value="increase_inquiries">收到詢問</option>
                  <option value="increase_bookings">預約服務</option>
                  <option value="sell_online">販售商品</option>
                  <option value="build_brand">建立品牌信任</option>
                </select></label
              >
            </div>
          </details>
          <button type="submit" class="studio-action">
            {{ result ? '重新規劃 AI 網站提案' : '讓 AI 幫我規劃網站' }}
            <span aria-hidden="true">↗</span>
          </button>
          <p class="studio-help">
            會將這些公開資料交給已設定的
            AI，可能有用量費。切換頁面、設計與尺寸不會重複呼叫 AI。
          </p>
          <button
            type="button"
            class="studio-secondary"
            @click="generate('template')"
          >
            先看不用 AI 的版型
          </button>
        </fieldset>
        <p v-if="error" class="studio-error" role="alert">{{ error }}</p>
        <p v-if="busy" class="studio-working" role="status">
          <span class="studio-working-dot" aria-hidden="true"></span
          >{{ busyPurpose }}
        </p>
        <p v-if="notice" class="studio-notice" role="status">{{ notice }}</p>
        <div v-if="result" class="studio-conversation">
          <p class="studio-kicker">LET’S MAKE IT YOURS</p>
          <h3>{{ t('哪裡還不像你？直接說。', 'What would make it feel more like you?') }}</h3>
          <div class="studio-suggestions" aria-label="修改靈感">
            <button
              v-for="suggestion in [
                t('目前這頁文字再精簡一點', 'Make this page more concise'),
                t('改成親切自然的語氣', 'Use a warmer, more natural tone'),
                t('說清楚下一步怎麼詢問', 'Make the next step clearer'),
              ]"
              :key="suggestion"
              type="button"
              :disabled="busy || saving || Boolean(pending)"
              @click="suggestRevision(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
          <label for="studio-revision"
            >{{ t('一句話修改', 'Refine in your own words') }}<textarea
              id="studio-revision"
              ref="revisionInput"
              v-model="revision"
              :disabled="busy || saving || Boolean(pending)"
              maxlength="600"
              rows="3"
              :placeholder="t('例如：客人大多是第一次接觸瑜伽，首頁請先安撫他們的顧慮，其他頁面保留。', 'For example: Our customers are new to yoga. Address their concerns on this page; keep the other pages unchanged.')"
            ></textarea>
          </label>
          <label v-if="requestIntake" class="studio-help"><input v-model="editAllPages" type="checkbox" :disabled="busy || saving || Boolean(pending)"> {{ t('允許修改所有頁面（預設只改目前預覽頁）', 'Allow changes to all pages (default: current page only)') }}</label>
          <div class="studio-edit-actions">
            <button
              type="button"
              class="studio-secondary"
              :disabled="
                busy ||
                saving ||
                Boolean(pending) ||
                !revision.trim() ||
                briefChanged
              "
              @click="proposeRevision"
            >
              {{ t('先看 AI 修改建議', 'Preview AI changes') }} →</button
            ><button
              type="button"
              class="studio-text"
              :disabled="busy || saving || Boolean(pending) || !revision"
              @click="revision = ''"
            >
              {{ t('清除', 'Clear') }}
            </button>
          </div>
          <p class="studio-help">
            {{ t('AI 會用目前草稿準備新版本；你確認後才套用，不會自動發布。', 'AI prepares a proposed revision. You decide whether to apply it; nothing is published automatically.') }}
          </p>
        </div>
        <p class="studio-help">
          {{ t('完成的完整提案會保存在本次申請中；重新整理可找回，不必重新呼叫 AI。', 'Your completed proposal is saved with this application. Reload it without another AI call.') }}
        </p>
        <button
          type="button"
          class="studio-text"
          :disabled="busy || intakeBusy || saving || Boolean(pending)"
          @click="openDetailed"
        >
          {{ t('我有既有網站，或想逐步填寫', 'I have an existing site, or prefer the step-by-step form') }} →
        </button>
      </form>

      <div class="studio-canvas">
        <div v-if="!result" class="studio-empty">
          <span class="studio-kicker">MORE THAN A GOOD-LOOKING WEBSITE</span>
          <div class="studio-swatch-stack" aria-hidden="true">
            <div
              v-for="direction in STUDIO_DIRECTIONS"
              :key="direction.key"
              :class="direction.key"
            >
              <span>YOUR BRAND</span><b>A new<br />beginning.</b><i></i>
            </div>
          </div>
          <h3>{{ t('不只「長得好看」，還要知道下一步。', 'A beautiful website with a clear next step.') }}</h3>
          <p>
            {{ t('你說明生意，AI 提出網站企劃與文案。', 'Tell us about your business. AI proposes the structure and copy.') }}<br />{{ t('缺少資料先問你；AI 內容仍需要你確認。', 'Missing details are asked first. You review and approve the content.') }}
          </p>
          <div class="studio-empty-steps">
            <span><b>01</b> {{ t('看懂你的品牌', 'Understand your brand') }}</span
            ><span><b>02</b> {{ t('安排訪客動線', 'Plan the visitor journey') }}</span
            ><span><b>03</b> {{ t('一句話再調整', 'Refine in your words') }}</span>
          </div>
          <p class="studio-help">{{ t('這裡尚未產生你的網站。', 'Your website has not been generated yet.') }}</p>
        </div>
        <template v-else>
          <div class="studio-result-head">
            <div>
              <p class="studio-kicker">
                {{
                  pending
                    ? t('REVIEW / 這次，我建議這樣改', 'REVIEW / PROPOSED CHANGES')
                    : t('YOUR WEBSITE / 從想法到網站提案', 'YOUR WEBSITE / FROM IDEA TO PROPOSAL')
                }}
              </p>
              <h3 ref="resultHeading" tabindex="-1">
                {{ renderedBrief?.brandName }} — {{ t('先從這裡開始。', 'Your website starts here.') }}
              </h3>
            </div>
            <span class="studio-source">{{
              showingConfirmed
                ? t('完整版本已確認', 'Complete version confirmed')
                : visibleResult?.source === 'llm'
                ? t('AI 提案・待確認', 'AI proposal · awaiting approval')
                : t('版型預覽・非 AI', 'Layout preview · no AI copy')
            }}</span>
          </div>
          <section
            v-if="visibleResult?.strategy"
            class="studio-strategy"
            :aria-label="t('網站規劃提案', 'Website proposal')"
          >
            <p class="studio-kicker">
              {{
                visibleResult.strategy.source === 'llm'
                  ? t('我對這個網站的建議', 'The proposal for your website')
                  : t('依所選用途安排的基本架構，非 AI 分析', 'A basic structure for your goal, not an AI analysis')
              }}
            </p>
            <h4>{{ visibleResult.strategy.proposition }}</h4>
            <p class="studio-audience">
              <span>{{ t('希望吸引', 'Who it is for') }}</span>{{ visibleResult.strategy.audience }}
            </p>
            <div class="studio-journey" :aria-label="t('建議的訪客動線', 'Proposed visitor journey')">
              <button
                v-for="(step, index) in visibleResult.strategy.journey"
                :key="index"
                type="button"
                :aria-pressed="currentPage === step.pageKey"
                @click="currentPage = step.pageKey"
              >
                <span>0{{ index + 1 }} <i aria-hidden="true">↗</i></span
                ><strong>{{ step.label }}</strong
                ><small>{{ step.purpose }}</small>
              </button>
            </div>
            <div class="studio-plan-foot">
              <p>
                <span>{{ t('主要行動', 'Primary action') }}</span>{{ visibleResult.strategy.primaryAction }}
              </p>
              <p>{{ visibleResult.strategy.designReason }}</p>
            </div>
            <details class="studio-evidence">
              <summary>{{ t('根據你說的什麼？還需要確認什麼？', 'What is this based on, and what needs confirming?') }}</summary>
              <p class="studio-help">
                {{ t('以下是你提供的原文；上方策略與 AI 文案仍需要你確認。', 'These are excerpts you supplied. The proposed strategy and AI copy still need your review.') }}
              </p>
              <blockquote
                v-for="fact in visibleResult.strategy.facts"
                :key="fact"
              >
                {{ fact }}
              </blockquote>
              <p v-if="visibleResult.strategy.questions.length" class="studio-help">
                {{ t('點一個問題，在修改欄補上答案，AI 就能依新資料修改：', 'Choose a question and add your answer in the edit field to refine the proposal:') }}
              </p>
              <button
                v-for="question in visibleResult.strategy.questions"
                :key="question"
                type="button"
                :disabled="busy || saving || Boolean(pending)"
                @click="suggestRevision(`${t('補充資料', 'More information')}: ${question}\n${t('我的答案', 'My answer')}: `)"
              >
                {{ question }} <span aria-hidden="true">↗</span>
              </button>
            </details>
          </section>
          <section
            v-if="pending"
            class="studio-review"
            :aria-label="t('確認 AI 修改', 'Review AI changes')"
          >
            <div>
              <p class="studio-kicker">{{ t('CHANGES / 尚未套用', 'CHANGES / NOT APPLIED') }}</p>
              <h4>
                {{ pending.preview.changes?.length }}
                {{ t('處文字有調整，你決定要不要用。', 'text changes. You decide whether to apply them.') }}
              </h4>
              <p>{{ pending.instruction }}</p>
            </div>
            <div class="studio-compare" role="group" :aria-label="t('比較修改前後', 'Compare before and after')">
              <button
                type="button"
                :aria-pressed="previewView === 'before'"
                @click="previewView = 'before'"
              >
                {{ t('看原稿', 'Before') }}</button
              ><button
                type="button"
                :aria-pressed="previewView === 'after'"
                @click="previewView = 'after'"
              >
                {{ t('看修改後', 'After') }}
              </button>
            </div>
            <details class="studio-diff">
              <summary>
                {{ t('逐項看文字差異', 'Inspect each text change') }} ({{ pending.preview.changes?.length }})
              </summary>
              <article
                v-for="change in pending.preview.changes"
                :key="change.key"
              >
                <h5>{{ change.label }}</h5>
                <div>
                  <p><b>{{ t('原本', 'Before') }}</b>{{ change.before || t('（沒有內容）', '(empty)') }}</p>
                  <p><b>{{ t('建議改為', 'Proposed') }}</b>{{ change.after || t('（移除）', '(removed)') }}</p>
                </div>
              </article>
            </details>
            <div class="studio-edit-actions">
              <button
                type="button"
                class="studio-action"
                :disabled="!canApply"
                @click="applyRevision"
              >
                {{ t('確認，套用到草稿', 'Apply to my draft') }} ✓</button
              ><button
                type="button"
                class="studio-text"
                :disabled="busy || saving"
                @click="discardRevision"
              >
                {{ t('先不要，保留原稿', 'Keep the previous version') }}
              </button>
            </div>
          </section>
          <div class="studio-directions" role="group" :aria-label="t('三種設計方向', 'Design directions')">
            <button
              v-for="direction in designDirections"
              :key="direction.key"
              type="button"
              :aria-pressed="selectedPreset === direction.key"
              :disabled="busy || saving"
              @click="selectedPreset = direction.key"
            >
              <span
                class="studio-color"
                :class="direction.key"
                :style="visibleResult?.design ? { background: visibleResult.design.accent } : undefined"
                aria-hidden="true"
              ></span
              ><strong>{{ direction.label }}</strong
              ><small>{{ direction.note }}</small>
            </button>
          </div>
          <div class="studio-toolbar">
            <span>{{ zh ? visibleResult?.sourceReason : visibleResult?.source === 'llm' ? 'Generated by the configured AI. Review before confirming.' : 'Layout only. No accepted AI copy is available.' }}</span>
            <div role="group" :aria-label="t('預覽尺寸', 'Preview size')">
              <button
                type="button"
                :aria-pressed="!mobile"
                @click="mobile = false"
              >
                {{ t('桌面', 'Desktop') }}</button
              ><button
                type="button"
                :aria-pressed="mobile"
                @click="mobile = true"
              >
                {{ t('手機', 'Mobile') }}
              </button>
            </div>
          </div>
          <details v-if="requestDesign && visibleResult?.design" class="studio-visual-controls">
            <summary>{{ t('直接微調外觀 · 不使用 AI 額度', 'Fine-tune the design · no AI credits') }}</summary>
            <fieldset :disabled="busy || saving || Boolean(pending) || dirty">
              <label>{{ t('品牌色', 'Brand colour') }}<input type="color" :value="customAccent || visibleResult.design.accent" @input="customAccent = ($event.target as HTMLInputElement).value"></label>
              <label>{{ t('背景色', 'Background colour') }}<input type="color" :value="customCanvas || visibleResult.design.canvas" @input="customCanvas = ($event.target as HTMLInputElement).value"></label>
              <button type="button" @click="refineDesign({ accent: customAccent || visibleResult.design.accent, canvas: customCanvas || visibleResult.design.canvas })">{{ t('套用色彩', 'Apply colours') }}</button>
              <label>{{ t('字體風格', 'Typography') }}<select :value="visibleResult.design.typography" @change="refineDesign({ typography: ($event.target as HTMLSelectElement).value as StudioDesign['typography'] })"><option value="serif">{{ t('優雅襯線', 'Editorial serif') }}</option><option value="sans">{{ t('簡潔俐落', 'Clean sans-serif') }}</option><option value="rounded">{{ t('柔和圓潤', 'Soft rounded') }}</option><option value="mono">{{ t('理性等寬', 'Precision monospace') }}</option></select></label>
              <label>{{ t('動態效果', 'Motion') }}<select :value="visibleResult.design.motion" @change="refineDesign({ motion: ($event.target as HTMLSelectElement).value as StudioDesign['motion'] })"><option value="none">{{ t('靜態', 'Still') }}</option><option value="soft">{{ t('柔和進場', 'Soft entrance') }}</option><option value="reveal">{{ t('分層進場', 'Layered reveal') }}</option></select></label>
            </fieldset>
          </details>
          <div class="studio-pages" role="group" :aria-label="t('預覽不同頁面', 'Preview pages')">
            <button
              v-for="page in availablePages"
              :key="page.key"
              type="button"
              :aria-pressed="currentPage === page.key"
              @click="currentPage = page.key"
            >
              {{ page.label }}<span aria-hidden="true">↗</span>
            </button>
          </div>
          <div class="studio-frame-shell" :class="{ 'is-mobile': mobile }">
            <iframe
              :key="`${visibleResult?.generatedAt}-${selectedPreset}-${currentPage}-${previewView}`"
              :srcdoc="selectedDesign?.html"
              sandbox=""
              referrerpolicy="no-referrer"
              :title="`${t('品牌網站設計預覽', 'Website design preview')}: ${availablePages.find(page => page.key === currentPage)?.label || t('首頁', 'Home')}`"
            ></iframe>
          </div>
          <p class="studio-help">
            {{ t('這是可比較的網站草稿，不是已上線網站；預覽內的連結、表單與購物不會執行。AI 內容須核對，未提供的商品、價格與成效不能當作真實資料。', 'This is a draft, not a live site. Links, forms and shopping are inactive in this preview. Review all AI content; unsupplied products, prices and outcomes are not verified facts.') }}
          </p>
          <p v-if="briefChanged" class="studio-change" role="status">
            {{ t('品牌需求已調整，請先重新產生預覽，再採用這個方向。', 'Your brief changed. Generate an updated preview before confirming.') }}
          </p>
          <p
            v-else-if="revision.trim() && !pending"
            class="studio-change"
            role="status"
          >
            {{ t('有一段尚未處理的修改要求。請先看修改建議，或清除要求後採用目前版本。', 'You have an unprocessed edit. Review the proposed changes or clear the request before confirming this version.') }}
          </p>
          <p v-if="saveError" class="studio-error" role="alert">
            {{ saveError }}
          </p>
          <div class="studio-finish">
            <button
              type="button"
              class="studio-text"
              :disabled="!history.length || busy || saving || Boolean(pending)"
              @click="undo"
            >
              ↶ {{ t('回到上一版', 'Restore previous version') }}</button
            ><button
              type="button"
              class="studio-action"
              :disabled="!canContinue"
              @click="continueWithDesign"
            >
              {{ saving ? t('確認完整版本中…', 'Confirming…') : t('確認這個完整版本，繼續上線', 'Confirm this version and continue to activation') }} →
            </button>
          </div>
          <p class="studio-help">
            {{ t('確認後，正式建置會沿用這份完整文案、圖片與版型，不會重新叫 AI 改稿。接著補齊聯絡資料、功能、網域與報價；現在不會付款、購買網域或部署。', 'The confirmed copy, images and design are used for the actual build without another AI rewrite. Contact details, integrations, domain and pricing follow. No payment, domain purchase or deployment occurs now.') }}
          </p>
          <section v-if="visibleResult?.deliveryReview" class="studio-evidence" aria-label="Delivery checks">
            <h4>{{ t('交付前還要確認', 'Before activation') }}</h4>
            <p v-if="visibleResult.deliveryReview.layoutOnly">{{ t('目前僅供排版預覽；請產生並確認正式 AI 文案後再繼續。', 'Layout-only preview. Generate and review the final AI copy before continuing.') }}</p>
            <p v-if="visibleResult.deliveryReview.missingHeroImage">{{ t('還沒有品牌主圖：可回需求頁加入自己的照片。', 'Brand photography is missing. Return to the brief to add your own image.') }}</p>
            <p v-if="visibleResult.deliveryReview.unactivatedModules.length">{{ t('所選購物／預約等串接仍未啟用，正式發布會被阻擋，不能用示意畫面交付。', 'Selected integrations are not active. Production is blocked until real functionality replaces the placeholders.') }}</p>
            <p>{{ t('請實際檢查手機與電腦；參考網站分析不代表已通過像素相似度或動畫驗收。', 'Review mobile and desktop. Reference analysis does not certify pixel similarity or animation fidelity.') }}</p>
          </section>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.studio-visual-controls{border:1px solid #d5cfc3;padding:12px 16px;margin-block:16px}.studio-visual-controls summary{cursor:pointer;font-size:13px;min-height:32px}.studio-visual-controls fieldset{display:flex;flex-wrap:wrap;align-items:end;gap:16px;border:0;padding:16px 0 4px;min-width:0}.studio-visual-controls label{display:grid;gap:6px;font-size:12px}.studio-visual-controls input,.studio-visual-controls select,.studio-visual-controls button{font:inherit;min-height:44px;max-width:100%;background:transparent;border:1px solid #b7a88f;color:inherit;padding:8px}.studio-visual-controls input[type=color]{width:64px;padding:4px}
.studio-flow{display:flex;justify-content:space-between;gap:16px;list-style:none;margin:0 0 24px;padding:20px 0;border-bottom:1px solid #b7a88f66;font-size:12px}.studio-flow li{opacity:.55}.studio-flow [aria-current]{opacity:1;font-weight:600}
.design-studio {
  --studio-ink: #171a32;
  --studio-blue: #4d5dad;
  --studio-paper: #faf8f3;
  color: var(--studio-ink);
  padding: 1rem 0 4rem;
}
.design-studio__intro {
  max-width: 48rem;
  margin: 0 0 2rem;
}
.studio-kicker {
  font:
    600 0.68rem/1.6 'DM Mono',
    monospace;
  letter-spacing: 0.14em;
  color: #5e647c;
}
.design-studio h2 {
  margin: 0.75rem 0;
  font:
    600 clamp(1.7rem, 3.4vw, 3rem) / 1.4 'Noto Serif TC',
    serif;
  letter-spacing: -0.045em;
}
.design-studio h2 em {
  font-style: normal;
  color: var(--studio-blue);
}
.design-studio__intro > p:last-child {
  color: #686c7e;
  line-height: 1.8;
}
.design-studio__layout {
  display: grid;
  grid-template-columns: minmax(16rem, 0.7fr) minmax(0, 1.6fr);
  gap: 1.5rem;
  align-items: start;
}
.studio-brief {
  padding: 1.4rem;
  border: 1px solid #d9d5cd;
  background: var(--studio-paper);
  border-radius: 1rem;
}
.studio-brief fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: grid;
  gap: 1rem;
}
.studio-brief legend {
  margin-bottom: 1.3rem;
  font-weight: 700;
  font-size: 0.85rem;
}
.studio-brief label {
  display: grid;
  gap: 0.5rem;
  font-size: 0.83rem;
  font-weight: 600;
}
.studio-brief input,
.studio-brief textarea,
.studio-brief select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  border: 1px solid #d0cec9;
  background: #fffefb;
  border-radius: 0.55rem;
  padding: 0.8rem;
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--studio-ink);
}
.studio-brief textarea {
  resize: vertical;
  font-family: inherit;
}
.studio-brief input,
.studio-brief select {
  font-family: inherit;
}
.studio-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.studio-examples {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.design-studio button {
  font-family: inherit;
  cursor: pointer;
}
.studio-examples button {
  padding: 0.5rem;
  border: 1px solid #dedbd5;
  border-radius: 2rem;
  background: transparent;
  font-size: 0.72rem;
  color: #4f556e;
}
.studio-help {
  font-size: 0.75rem;
  line-height: 1.8;
  color: #666c7d;
  margin: 0.3rem 0;
}
.studio-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--studio-blue);
  border-radius: 0.5rem;
  background: var(--studio-blue);
  color: #fff;
  font-size: 0.85rem;
  line-height: 1.7;
  font-weight: 600;
}
.studio-secondary {
  padding: 0.75rem;
  border: 1px solid #b6bddb;
  background: #eef0fa;
  color: #344381;
  border-radius: 0.5rem;
}
.studio-text {
  padding: 0.75rem 0;
  border: 0;
  background: transparent;
  color: #434d7f;
  text-align: left;
  font-size: 0.78rem;
}
.studio-ai {
  border-top: 1px solid #dedbd5;
  padding-top: 1rem;
  font-size: 0.8rem;
  line-height: 1.8;
  color: #626778;
}
.studio-ai summary {
  color: #374578;
  cursor: pointer;
}
.design-studio button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.design-studio :is(button, input, textarea, select, summary):focus-visible {
  outline: 3px solid #939ed6;
  outline-offset: 3px;
}
.studio-error,
.studio-change {
  padding: 0.8rem;
  border-radius: 0.4rem;
  background: #f8e9df;
  color: #784329;
  font-size: 0.85rem;
  line-height: 1.8;
}
.studio-canvas {
  min-width: 0;
  border: 1px solid #d9d5cd;
  border-radius: 1rem;
  background: #f6f4ef;
  padding: 1.2rem;
}
.studio-empty {
  min-height: 36rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 1rem;
  overflow: hidden;
}
.studio-empty h3 {
  font:
    600 1.35rem/1.7 'Noto Serif TC',
    serif;
  margin: 2rem 0 0.5rem;
}
.studio-empty > p {
  font-size: 0.88rem;
  color: #6d7081;
  line-height: 1.8;
}
.studio-swatch-stack {
  width: min(100%, 33rem);
  min-height: 16rem;
  position: relative;
  margin: 2rem auto 0;
}
.studio-swatch-stack > div {
  position: absolute;
  box-sizing: border-box;
  width: 48%;
  height: 15rem;
  left: 26%;
  top: 0;
  padding: 1.5rem;
  text-align: left;
  border: 1px solid #b6b4b04d;
  box-shadow: 0 1.5rem 2rem #20223c18;
  border-radius: 0.5rem;
}
.studio-swatch-stack .atelier {
  transform: translateX(-37%) rotate(-10deg);
}
.studio-swatch-stack .bloom {
  transform: translateX(37%) rotate(10deg);
}
.studio-swatch-stack .alignment {
  transform: translateY(1.4rem);
}
.studio-swatch-stack span {
  font: 600 0.55rem/1.5 monospace;
  letter-spacing: 0.12em;
}
.studio-swatch-stack b {
  display: block;
  margin: 2rem 0;
  font:
    500 2.15rem/1 Georgia,
    serif;
}
.studio-swatch-stack i {
  display: block;
  width: 35%;
  height: 1rem;
  background: currentColor;
  opacity: 0.3;
}
.atelier {
  background: #f3eee6;
  color: #914b5b;
}
.bloom {
  background: #eef3eb;
  color: #17362e;
}
.alignment {
  background: #071722;
  color: #6de2c2;
}
.studio-result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}
.studio-result-head h3 {
  font-size: 1.2rem;
  overflow-wrap: anywhere;
  margin: 0.4rem 0;
}
.studio-source {
  white-space: nowrap;
  font-size: 0.7rem;
  color: #3c5262;
  background: #e5edeb;
  padding: 0.45rem 0.6rem;
  border-radius: 2rem;
}
.studio-directions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}
.studio-directions button {
  display: grid;
  gap: 0.4rem;
  text-align: left;
  border: 1px solid #d5d2ca;
  border-radius: 0.6rem;
  background: #fffdf8;
  color: #404555;
  padding: 0.7rem;
}
.studio-directions button[aria-pressed='true'] {
  outline: 2px solid var(--studio-blue);
  outline-offset: 1px;
}
.studio-directions strong {
  font-size: 0.83rem;
}
.studio-directions small {
  font-size: 0.68rem;
  line-height: 1.5;
  color: #656b7b;
}
.studio-color {
  display: block;
  height: 1.3rem;
  width: 100%;
  border-radius: 0.2rem;
  border-bottom: 4px solid currentColor;
}
.studio-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin: 1.1rem 0;
  font-size: 0.72rem;
  line-height: 1.6;
  color: #5f6577;
}
.studio-toolbar > div {
  display: flex;
  flex-shrink: 0;
}
.studio-toolbar button {
  padding: 0.5rem;
  border: 1px solid #d5d2ca;
  color: #4d5369;
  background: transparent;
  font-size: 0.7rem;
}
.studio-toolbar button[aria-pressed='true'] {
  background: #e3e6f1;
  color: #263778;
}
.studio-frame-shell {
  width: 100%;
  margin: 0 auto 1rem;
  background: #fff;
  overflow: hidden;
  border: 1px solid #d1cec6;
  box-sizing: border-box;
  border-radius: 0.55rem;
}
.studio-frame-shell.is-mobile {
  max-width: 390px;
}
.studio-frame-shell iframe {
  display: block;
  width: 100%;
  height: 39rem;
  border: 0;
  background: #fff;
}
.studio-finish {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-top: 1rem;
}
.studio-finish .studio-action {
  max-width: 75%;
}
@media (max-width: 850px) {
  .design-studio__layout {
    grid-template-columns: 1fr;
  }
  .studio-brief {
    padding: 1.15rem;
  }
  .studio-empty {
    min-height: 25rem;
  }
  .studio-toolbar {
    align-items: flex-start;
  }
  .studio-frame-shell iframe {
    height: 34rem;
  }
  .studio-canvas {
    padding: 0.8rem;
  }
  .studio-finish {
    align-items: stretch;
  }
  .studio-finish .studio-action {
    font-size: 0.75rem;
  }
  .studio-directions {
    gap: 0.5rem;
  }
  .studio-directions button {
    padding: 0.6rem;
  }
  .studio-directions small {
    font-size: 0.65rem;
  }
}
.studio-brief :is(input, select, textarea) {
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.7;
}
.studio-preferences {
  font-size: 0.83rem;
  line-height: 1.8;
}
.studio-preferences summary {
  cursor: pointer;
  color: #4c5275;
}
.studio-preferences .studio-fields {
  margin-top: 0.8rem;
}
.studio-working,
.studio-notice {
  padding: 0.9rem;
  border: 1px solid #c5d3c9;
  border-radius: 0.6rem;
  font-size: 0.8rem;
  line-height: 1.8;
  background: #edf3ed;
  color: #355249;
}
.studio-working-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  margin-right: 0.5rem;
  border-radius: 50%;
  background: #507466;
}
.studio-conversation {
  border-top: 1px solid #d8d7d0;
  padding-top: 1.2rem;
  margin-top: 1.3rem;
}
.studio-conversation h3 {
  font-size: 1rem;
  line-height: 1.6;
  margin: 0.4rem 0 0.9rem;
}
.studio-conversation label {
  margin: 0.9rem 0 0.7rem;
}
.studio-suggestions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.studio-suggestions button {
  background: #fffdf8;
  border: 1px solid #d8d7d0;
  color: #555b76;
  padding: 0.45rem 0.65rem;
  border-radius: 1rem;
  font-size: 0.7rem;
  line-height: 1.6;
}
.studio-edit-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.studio-edit-actions .studio-secondary {
  font-size: 0.78rem;
}
.studio-strategy {
  padding: 1.25rem 1.35rem;
  margin: 1.1rem 0 1.3rem;
  border: 1px solid #d6d9e5;
  border-radius: 0.8rem;
  background: linear-gradient(135deg, #fefdf8, #f0f1f8);
}
.studio-strategy h4 {
  font:
    600 clamp(1rem, 1.7vw, 1.3rem) / 1.7 'Noto Serif TC',
    serif;
  margin: 0.5rem 0 0.7rem;
  color: #2e3457;
}
.studio-audience {
  font-size: 0.82rem;
  line-height: 1.8;
  color: #5a6073;
}
.studio-audience > span,
.studio-plan-foot p > span {
  display: block;
  font-size: 0.66rem;
  color: #6d7181;
  letter-spacing: 0.08em;
  margin-bottom: 0.2rem;
}
.studio-journey {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin: 1rem 0;
}
.studio-journey button {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: #fffefa;
  border: 1px solid #dbdce3;
  border-radius: 0.65rem;
  padding: 0.85rem;
  text-align: left;
  color: #383f5d;
}
.studio-journey button[aria-pressed='true'] {
  border-color: #8b96c1;
  background: #f5f5fc;
}
.studio-journey button > span {
  width: 100%;
  display: flex;
  justify-content: space-between;
  color: #7882a7;
  font: 500 0.7rem/1.5 monospace;
}
.studio-journey i {
  font-style: normal;
}
.studio-journey strong {
  font-size: 0.83rem;
  line-height: 1.6;
}
.studio-journey small {
  font-size: 0.7rem;
  line-height: 1.7;
  color: #6b7181;
}
.studio-plan-foot {
  display: grid;
  grid-template-columns: minmax(6rem, 0.4fr) 1fr;
  gap: 1rem;
  font-size: 0.75rem;
  line-height: 1.8;
  color: #61687e;
}
.studio-plan-foot p {
  margin: 0.3rem 0;
}
.studio-evidence {
  margin-top: 0.8rem;
  border-top: 1px solid #dedfe6;
  padding-top: 0.8rem;
  font-size: 0.75rem;
  line-height: 1.8;
  color: #525b74;
}
.studio-evidence summary {
  cursor: pointer;
}
.studio-evidence blockquote {
  margin: 0.7rem 0;
  padding: 0.2rem 0.75rem;
  border-left: 2px solid #959ebe;
  color: #71768a;
  overflow-wrap: anywhere;
}
.studio-evidence button {
  display: flex;
  width: 100%;
  gap: 1rem;
  justify-content: space-between;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #e0e2ea;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.7;
  color: #465788;
  padding: 0.65rem 0.2rem;
}
.studio-pages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.65rem;
}
.studio-pages button {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.5rem 0.7rem;
  background: #fdfcf8;
  border: 1px solid #d9d6d0;
  border-radius: 0.4rem;
  color: #626779;
  font-size: 0.72rem;
}
.studio-pages button[aria-pressed='true'] {
  color: #fff;
  background: #343c66;
  border-color: #343c66;
}
.studio-pages button span {
  opacity: 0.6;
}
.studio-review {
  padding: 1.1rem;
  border: 1px solid #95bbae;
  border-radius: 0.75rem;
  background: #edf5f0;
  margin: 0 0 1.3rem;
}
.studio-review h4 {
  font-size: 0.95rem;
  line-height: 1.7;
  margin: 0.3rem 0;
}
.studio-review > div > p:not(.studio-kicker) {
  font-size: 0.8rem;
  line-height: 1.7;
  color: #5f6c63;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.studio-compare {
  display: flex;
  gap: 0.5rem;
  margin: 0.9rem 0;
}
.studio-compare button {
  border: 1px solid #c1d2c9;
  padding: 0.55rem 0.85rem;
  border-radius: 0.4rem;
  background: #f9fcf9;
  color: #4a6658;
  font-size: 0.78rem;
}
.studio-compare button[aria-pressed='true'] {
  color: #fff;
  background: #375e4d;
  border-color: #375e4d;
}
.studio-diff {
  margin: 1rem 0;
  color: #475f51;
  font-size: 0.78rem;
}
.studio-diff summary {
  cursor: pointer;
}
.studio-diff article {
  border-top: 1px solid #d2e0d6;
  margin: 1rem 0;
}
.studio-diff h5 {
  font-size: 0.8rem;
  margin: 0.8rem 0;
}
.studio-diff article > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
.studio-diff article p {
  min-width: 0;
  padding: 0.7rem;
  margin: 0;
  background: #ffffffa6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.studio-diff article b {
  display: block;
  color: #8b918c;
  font-size: 0.68rem;
  font-weight: 400;
  margin-bottom: 0.4rem;
}
.studio-empty-steps {
  display: flex;
  gap: 1.2rem;
  flex-wrap: wrap;
  justify-content: center;
  margin: 1.1rem 0;
  font-size: 0.73rem;
  color: #62687e;
}
.studio-empty-steps b {
  color: #8c93b4;
  margin-right: 0.35rem;
  font-family: monospace;
}
@media (max-width: 600px) {
  .studio-strategy {
    padding: 1rem;
  }
  .studio-journey {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  .studio-journey button {
    display: grid;
    grid-template-columns: 1.8rem 1fr;
    gap: 0.2rem 0.65rem;
    padding: 0.7rem;
  }
  .studio-journey button > span {
    grid-row: span 2;
    display: block;
    padding-top: 0.2rem;
  }
  .studio-journey i {
    display: none;
  }
  .studio-journey strong,
  .studio-journey small {
    grid-column: 2;
  }
  .studio-plan-foot {
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }
  .studio-diff article > div {
    grid-template-columns: 1fr;
  }
  .studio-result-head {
    align-items: flex-start;
  }
  .studio-result-head h3 {
    font-size: 1.05rem;
  }
  .studio-source {
    font-size: 0.6rem;
  }
  .studio-empty-steps {
    gap: 0.6rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .design-studio * {
    scroll-behavior: auto;
  }
}
</style>
