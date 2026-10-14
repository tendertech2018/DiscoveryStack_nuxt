<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LaunchRequest } from '../utils/managedSiteLaunch'
import { runtimeDeliveryCopy } from '../utils/managedSiteRuntimeCopy'
import { siteTextDirection } from '../utils/managedSiteLanguage'
const props = defineProps<{ request: LaunchRequest; language: string; goal?: string }>()
type Status = { prepared: boolean; choices: { engine: string; currency: string; timeZone: string } | null; packageFingerprint: string | null; hostingConfigured: boolean; publishing: boolean; publication: { origin: string; contentHash: string } | null }
type Package = { manifestFingerprint: string; config: { locale: string; currency: string }; approvedDelivery: { assets: Array<{ path: string; content: string }> } }
const status = ref<Status | null>(null), artifact = ref<Package | null>(null)
const fixedEngine = computed(() => props.goal === 'sell_online' ? 'commerce' : props.goal === 'increase_bookings' ? 'booking_blog' : null)
const currency = ref(''), timeZone = ref(''), engine = ref(fixedEngine.value || 'commerce')
const busy = ref(false), error = ref(''), checked = ref(false)
const say = (cn: string, en: string) => runtimeDeliveryCopy(props.language, cn, en)
const currencies = ['TWD', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'VND', 'HKD', 'SGD', 'AUD', 'CAD', 'NZD', 'CHF', 'CNY', 'THB', 'MYR', 'PHP', 'INR', 'IDR', 'AED', 'SAR', 'BRL', 'MXN']
const locked = computed(() => Boolean(status.value?.publishing || status.value?.publication))
// The in-panel document is a design review, not a fake transaction host.
const preview = computed(() => (artifact.value?.approvedDelivery.assets.find(a => a.path === 'index.html')?.content || '').replace('<body', '<body inert'))
let alive = true
async function refresh() {
  const result = await props.request<Status>('/runtime-package', { method: 'GET' })
  if (!alive) return
  status.value = result
  if (result.choices) { currency.value = result.choices.currency; timeZone.value = result.choices.timeZone; engine.value = result.choices.engine }
  if (result.prepared) {
    const restored = await props.request<Package>('/runtime-export', { method: 'GET' })
    await nextTick()
    if (alive) artifact.value = restored
  }
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await action() } catch { if (alive) error.value = say('操作未完成。請重新確認版本及設定；發布狀態不明時請按「核對／重試發布」，不要重建網站。', 'Could not complete the operation. Check the version and settings. If publication is uncertain, use Verify / retry publication instead of creating another site.') }
  finally { if (alive) busy.value = false }
}
function prepare() { return run(async () => {
  artifact.value = await props.request<Package>('/runtime-package', { method: 'POST', body: { engine: engine.value, currency: currency.value, timeZone: timeZone.value } })
  checked.value = false
  await refresh()
}) }
function publish() { return run(async () => {
  if (!checked.value || !status.value?.packageFingerprint) return
  try { await props.request('/runtime-publish', { method: 'POST', body: { packageFingerprint: status.value.packageFingerprint } }) }
  finally { await refresh() }
}) }
function download() {
  if (!artifact.value) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(artifact.value)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = 'confirmed-customer-site.json'; a.click(); URL.revokeObjectURL(url)
}
onMounted(() => { timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; void run(refresh) })
onBeforeUnmount(() => { alive = false })
watch([currency, timeZone, engine], () => { artifact.value = null; checked.value = false })
</script>

<template>
  <section class="runtime-delivery" :aria-busy="busy" :dir="siteTextDirection(language)">
    <p class="eyebrow">{{ say('你的設計，接上真正的功能', 'Your design. Working functions.') }}</p>
    <h2>{{ say('購物／預約網站', 'Shopping / booking website') }}</h2>
    <p>{{ say('沿用你已確認的設計、圖片與文字，使用內建購物或預約。不會連接外部 Shopify／Google 帳號，也不會因此購買主機或扣款。', 'Keep your confirmed design, photography and copy with native shopping or booking. This does not connect Shopify / Google accounts, purchase hosting or charge a card.') }}</p>
    <form @submit.prevent="prepare">
      <fieldset :disabled="busy || locked">
        <div class="choices">
          <label v-if="!fixedEngine">{{ say('功能', 'Function') }}<select v-model="engine"><option value="commerce">{{ say('購物、訂單與庫存', 'Shopping, orders and inventory') }}</option><option value="booking_blog">{{ say('預約、時段與文章', 'Bookings, availability and articles') }}</option></select></label>
          <p v-else class="known-function">{{ engine === 'commerce' ? say('購物、訂單與庫存', 'Shopping, orders and inventory') : say('預約、時段與文章', 'Bookings, availability and articles') }}</p>
          <label>{{ say('收費幣別（不自動換匯）', 'Pricing currency (no automatic conversion)') }}<select v-model="currency" required><option value="" disabled>{{ say('選擇幣別', 'Choose currency') }}</option><option v-for="code in currencies" :key="code">{{ code }}</option></select></label>
          <label>{{ say('服務時區', 'Service time zone') }}<input v-model.trim="timeZone" required maxlength="80" placeholder="Asia/Taipei"></label>
        </div>
        <button type="submit">{{ busy ? say('處理中…', 'Working…') : say('接上功能，準備網站', 'Connect functions and prepare website') }} →</button>
      </fieldset>
    </form>
    <template v-if="status?.prepared">
      <p class="state">{{ status.publication ? say('已核對發布版本', 'Published version verified') : status.hostingConfigured ? say('已接主機，等待你確認發布', 'Host connected. Ready for publication review.') : say('網站包已準備；尚未上線，等待專用主機', 'Website package prepared. Not live yet; dedicated hosting is required.') }}</p>
      <p v-if="!status.hostingConfigured">{{ say('不會把訂單或預約存到會消失的展示環境。你現在不需要提供 Stripe 金鑰。', 'Orders and bookings will not be stored in an ephemeral demo. No Stripe keys are needed yet.') }}</p>
      <p v-if="preview">{{ say('購物與預約操作會在專用網站啟用；這裡只檢視設計。', 'Shopping and booking run on the dedicated website. This panel only reviews the design.') }}</p>
      <iframe v-if="preview" :srcdoc="preview" sandbox="" referrerpolicy="no-referrer" :title="say('確認設計預覽（僅檢視）', 'Confirmed design preview (view only)')" />
      <button v-if="artifact" type="button" :disabled="busy" @click="download">{{ say('下載確認版網站包（不含金鑰）', 'Download confirmed website package (no secrets)') }}</button>
      <template v-if="status.hostingConfigured && !status.publication">
        <label class="review"><input v-model="checked" type="checkbox">{{ say('我確認設計、功能與幣別，發布此版本。商品、時段、政策與付款設定仍須通過實際檢查。', 'I approve this design, functionality and currency for publication. Products, availability, policies and payment settings must pass readiness checks.') }}</label>
        <button type="button" :disabled="busy || !checked" @click="publish">{{ status.publishing ? say('核對／重試發布', 'Verify / retry publication') : say('發布確認版本', 'Publish confirmed version') }}</button>
      </template>
      <a v-if="status.publication" :href="status.publication.origin" target="_blank" rel="noopener noreferrer">{{ say('開啟已發布網站', 'Open published website') }} ↗</a>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.runtime-delivery{padding:clamp(22px,4vw,42px);background:#f8f5ef;border:1px solid #d5cfc3;margin-bottom:24px;color:#171a32}.eyebrow{font-size:12px;letter-spacing:.08em}h2{font:400 clamp(24px,3vw,36px)/1.3 Georgia,serif;margin:12px 0}p{line-height:1.8}.choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}fieldset{border:0;padding:0;min-width:0}label{display:grid;gap:8px;font-size:13px}input,select,button{font:inherit;box-sizing:border-box;min-width:0;padding:13px;border:1px solid #b7a88f;background:transparent;color:inherit}button{min-height:44px;margin-top:20px;cursor:pointer}button:disabled{opacity:.5}.state{padding:16px;background:#e6eade}.review{display:flex;align-items:flex-start;margin-top:20px;line-height:1.7}.review input{flex:0 0 auto}.runtime-delivery iframe{width:100%;height:480px;border:1px solid #d5cfc3;background:white}.runtime-delivery a{display:block;padding:14px;color:inherit}input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid #171a32;outline-offset:3px}@media(max-width:680px){.choices{grid-template-columns:1fr}}
</style>
