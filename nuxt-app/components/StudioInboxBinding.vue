<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { journeyText } from '../utils/managedSiteJourneyCopy'
import type { LaunchInbox, LaunchRequest, LaunchSession } from '../utils/managedSiteLaunch'

const props = defineProps<{ language: string; email: string; binding?: LaunchInbox; request: LaunchRequest; disabled?: boolean }>()
const emit = defineEmits<{ saved: [session: LaunchSession] }>()
const t = (key: Parameters<typeof journeyText>[1]) => journeyText(props.language, key)
const binding = ref<LaunchInbox>(props.binding || { status: 'unbound', maskedEmail: null, resendAvailableAt: null, transportConfigured: false })
const inbox = ref(props.email), code = ref(''), changing = ref(false), busy = ref(false), error = ref('')
const now = ref(Date.now()); let timer: ReturnType<typeof setInterval> | undefined; let sequence = 0
const waiting = computed(() => Boolean(binding.value.resendAvailableAt && Date.parse(binding.value.resendAvailableAt) > now.value))
const editable = computed(() => binding.value.status !== 'bound' || changing.value)
const canSend = computed(() => !busy.value && !props.disabled && !waiting.value && binding.value.transportConfigured && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(inbox.value))
watch(() => props.binding, value => { if (value) binding.value = value })
watch(() => props.email, (value, previous) => { if (!inbox.value || inbox.value === previous) inbox.value = value })
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { sequence++; clearInterval(timer) })

async function sendCode() {
  if (!canSend.value) return
  const current = ++sequence; busy.value = true; error.value = ''; code.value = ''
  try {
    const result = await props.request<{ status: 'pending'; maskedEmail: string; resendAvailableAt: string }>('/inbox-binding', { method: 'POST', body: { email: inbox.value.trim() } })
    if (current !== sequence) return
    if (result.status !== 'pending') throw new Error('INBOX_NOT_PENDING')
    binding.value = { ...binding.value, ...result }
  } catch { if (current === sequence) error.value = t('inboxFailure') }
  finally { if (current === sequence) busy.value = false }
}
async function verifyCode() {
  if (busy.value || props.disabled || binding.value.status !== 'pending' || !/^\d{6}$/u.test(code.value)) return
  const current = ++sequence; busy.value = true; error.value = ''
  try {
    const result = await props.request<{ status: 'bound'; maskedEmail: string }>('/inbox-binding-confirm', { method: 'POST', body: { code: code.value } })
    if (current !== sequence) return
    if (result.status !== 'bound') throw new Error('INBOX_NOT_BOUND')
    binding.value = { ...binding.value, ...result }; changing.value = false; code.value = ''
    const session = await props.request<LaunchSession>('', { method: 'GET' })
    if (current === sequence) emit('saved', session)
  } catch { if (current === sequence) error.value = t('inboxFailure') }
  finally { if (current === sequence) busy.value = false }
}
</script>

<template>
  <section class="inbox-binding" :aria-busy="busy">
    <p>{{ t('inboxHelp') }}</p>
    <p v-if="binding.status === 'bound'" role="status">✓ {{ t('inboxBound') }}: {{ binding.maskedEmail }}</p>
    <details><summary>{{ t('inbox') }}</summary>
      <p v-if="!binding.transportConfigured" role="status">{{ t('inboxUnavailable') }}</p>
      <template v-else>
        <button v-if="!editable" type="button" :disabled="busy || disabled" @click="changing = true">{{ t('inboxChange') }}</button>
        <div v-else class="inbox-fields">
          <label>{{ t('email') }}<input v-model.trim="inbox" type="email" autocomplete="email" maxlength="320" :disabled="busy || disabled"></label>
          <button type="button" :disabled="!canSend" @click="sendCode">{{ waiting ? t('wait') : busy ? t('saving') : t('inboxSend') }}</button>
          <template v-if="binding.status === 'pending'">
            <p class="pending" role="status">{{ t('inboxPending') }} {{ binding.maskedEmail }}</p>
            <label>{{ t('inboxCode') }}<input v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" :disabled="busy || disabled" @keydown.enter.prevent="verifyCode"></label>
            <button type="button" :disabled="busy || disabled || !/^\d{6}$/.test(code)" @click="verifyCode">{{ t('inboxConfirm') }}</button>
          </template>
        </div>
      </template>
    </details>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.inbox-binding{padding:24px;border:1px solid #d5cfc3;background:#f8f5ef;margin-block:20px;font-size:13px;line-height:1.8;overflow-wrap:anywhere}.inbox-binding>p:first-child{margin-top:0}summary,button{min-height:44px;cursor:pointer;touch-action:manipulation}summary{padding-block:8px}.inbox-fields{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:end;margin-top:12px}label{display:grid;gap:8px}input{box-sizing:border-box;width:100%;min-width:0;font:inherit;padding:12px;background:transparent;color:inherit;border:1px solid #b7a88f}button{font:inherit;color:inherit;border:1px solid #b7a88f;background:transparent;padding:12px 20px}button:disabled{opacity:.45;cursor:not-allowed}.pending{grid-column:1/-1;margin:0}.error{color:#9c2c39}:focus-visible{outline:2px solid #171a32;outline-offset:4px}@media(max-width:650px){.inbox-fields{grid-template-columns:1fr}}
</style>
