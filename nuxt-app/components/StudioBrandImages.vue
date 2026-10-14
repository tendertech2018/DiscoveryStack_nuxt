<script setup lang="ts">
import { ref } from 'vue'
import type { StudioIntakeReply } from '../utils/managedSiteGuided'
import type { StudioMedia } from '../utils/managedSitePresentation'
const props = defineProps<{ media?: StudioMedia[]; revision: number; language: string; disabled?: boolean; save: (body: Record<string, unknown>) => Promise<StudioIntakeReply> }>()
const emit = defineEmits<{ saved: [value: StudioIntakeReply]; busy: [value: boolean] }>()
const selected = ref<File | null>(null), slot = ref<'hero' | 'detail'>('hero'), alt = ref(''), rights = ref(false), busy = ref(false), error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const t = (zh: string, en: string) => props.language.startsWith('zh') ? zh : en
function pick(event: Event) { selected.value = (event.target as HTMLInputElement).files?.[0] || null }
async function dataUrl(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000) throw new Error('image')
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > 16_000_000) throw new Error('image')
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d'); if (!context) throw new Error('image')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [.8, .6, .4]) { const value = canvas.toDataURL('image/webp', quality); if (value.length < 220_000) return value }
    throw new Error('image')
  } finally { bitmap.close() }
}
async function saveImage(removeSlot?: 'hero' | 'detail') {
  if (busy.value || props.disabled || (!removeSlot && (!selected.value || !rights.value || !alt.value.trim()))) return
  busy.value = true; emit('busy', true); error.value = ''
  try {
    const payload = removeSlot ? { slot: removeSlot, remove: true } : { slot: slot.value, dataUrl: await dataUrl(selected.value!), alt: alt.value.trim(), rightsConfirmed: true }
    const result = await props.save({ ...payload, revision: props.revision })
    emit('saved', result); selected.value = null; alt.value = ''; rights.value = false
    if (fileInput.value) fileInput.value.value = ''
  } catch {
    error.value = t('照片沒有儲存，原圖仍保留。請使用 8 MB、1600 萬畫素以內的 JPG、PNG 或 WebP；若另一分頁改過需求，請先重新讀取。', 'The image was not saved; the previous image is preserved. Use a JPG, PNG or WebP under 8 MB and 16 megapixels. Reload the brief if it changed in another tab.')
  } finally { busy.value = false; emit('busy', false) }
}
</script>
<template>
  <section class="brand-images">
    <h4>{{ t('放入你的品牌照片', 'Add your brand photography') }}</h4>
    <p>{{ t('可以先跳過；缺圖片會清楚標示，不會用別人的商品冒充你的。圖片僅儲存在這份申請，不傳給 AI；會壓縮並移除定位等資訊。', 'Optional for a first draft. Missing images are clearly marked. Images stay with this application, are not sent to AI, and are compressed with location metadata removed.') }}</p>
    <div class="uploaded"><figure v-for="image in media || []" :key="image.slot"><img :src="image.dataUrl" :alt="image.alt"><figcaption>{{ image.alt }}</figcaption><button type="button" :disabled="busy || disabled" @click="saveImage(image.slot)">{{ t('移除', 'Remove') }}</button></figure></div>
    <fieldset :disabled="busy || disabled">
      <label>{{ t('圖片位置', 'Placement') }}<select v-model="slot"><option value="hero">{{ t('品牌主圖', 'Hero photograph') }}</option><option value="detail">{{ t('細節／商品特寫', 'Detail photograph') }}</option></select></label>
      <label>{{ t('選擇自己的照片', 'Choose your photograph') }}<input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" @change="pick"></label>
      <label>{{ t('照片說明（使用網站語言）', 'Image description (in the website language)') }}<input v-model="alt" maxlength="200"></label>
      <label class="check"><input v-model="rights" type="checkbox">{{ t('我有權在這個網站使用這張照片。', 'I have permission to use this photograph on this website.') }}</label>
      <button type="button" :disabled="!selected || !rights || !alt.trim()" @click="saveImage()">{{ busy ? t('處理中…', 'Preparing…') : t('儲存照片', 'Save photograph') }}</button>
    </fieldset>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.brand-images{border-top:1px solid #b7a88f44;padding-top:1.5rem;margin-top:2rem}.brand-images p{font-size:.75rem;line-height:1.7;opacity:.8}fieldset{padding:0;margin:0;border:0;min-width:0}label{display:grid;gap:.4rem;margin-block:1rem;font-size:.8rem}input,select,button{font:inherit;color:inherit;background:transparent;border:1px solid #b7a88f66;padding:.8rem;min-width:0;max-width:100%}select option{color:#171a32;background:#eee9df}.check{display:flex;align-items:flex-start}.check input{margin:.25rem .5rem 0 0}button{cursor:pointer;min-height:44px}button:disabled{opacity:.4}.uploaded{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.uploaded figure{margin:0;min-width:0}.uploaded img{width:100%;aspect-ratio:1;object-fit:cover}.uploaded figcaption{font-size:.7rem;overflow-wrap:anywhere}
</style>
