<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { journeyText } from '../utils/managedSiteJourneyCopy'
import { siteTextDirection } from '../utils/managedSiteLanguage'
import { studioAuthorizationCopy, studioDomainAuthorizationCopy } from '../utils/managedSiteAuthorizationCopy'
import { launchAvailabilityCurrent, launchRegistrantValid, launchQuoteLabel, prepareStudioLaunch, studioLaunchErrorKind, type LaunchAvailability, type LaunchCatalog, type LaunchQuote, type LaunchRegistrant, type LaunchRequest, type LaunchSession } from '../utils/managedSiteLaunch'

const props = defineProps<{ session: LaunchSession; catalog: LaunchCatalog; request: LaunchRequest; language: string; unactivatedModules: string[] }>()
const emit = defineEmits<{ saved: [session: LaunchSession]; back: [] }>()
const t = (key: Parameters<typeof journeyText>[1]) => journeyText(props.language, key)
const source = props.session.answers
const contact = ref({ contactName: source.contact?.contactName || '', email: source.contact?.email || '' })
const domain = ref({ option: 'new' as const, name: source.domain?.option === 'new' ? source.domain.name || '' : '', tld: source.domain?.tld || props.catalog.domainTlds[0]?.tld || '' })
const plan = ref({ planKey: source.plan?.planKey || 'site_only', ...(source.plan?.cadenceDays ? { cadenceDays: source.plan.cadenceDays } : {}) })
const registrant = ref<LaunchRegistrant>({ firstName: contact.value.contactName, lastName: '', organization: source.company?.brandName || '', address1: '', city: '', state: '', postalCode: '', country: '', phoneCountryCode: '', phone: '', email: contact.value.email, ...props.session.domainRegistration?.registrant })
const availability = ref<LaunchAvailability | null>(props.session.domainAvailability)
const delegated = ref(Boolean(props.session.domainRegistration?.delegated))
const read = ref(Boolean(props.session.consentSnapshot)), agreed = ref(Boolean(props.session.consentSnapshot))
const termsPane = ref<HTMLElement | null>(null), quoteHeading = ref<HTMLElement | null>(null)
const busy = ref(false), error = ref(''), note = ref(''), quote = ref<LaunchQuote | null>(null), previewUrl = ref(props.session.previewUrl || ''), reviewed = ref(false), paid = ref(false)
const now = ref(Date.now()); let timer: ReturnType<typeof setInterval> | undefined; let alive = true
const currentAvailability = computed(() => launchAvailabilityCurrent(availability.value, domain.value.name, domain.value.tld, now.value))
const locked = computed(() => props.session.status !== 'active' || props.session.studio?.buildStarted || Boolean(previewUrl.value))
const ready = computed(() => contact.value.contactName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact.value.email) && launchRegistrantValid(registrant.value) && currentAvailability.value && read.value && agreed.value && delegated.value && (plan.value.planKey !== 'site_geo_autopost' || plan.value.cadenceDays))
const canBuild = computed(() => Boolean(quote.value && !previewUrl.value && !props.unactivatedModules.length && (ready.value || locked.value)))
const money = (amount: number) => new Intl.NumberFormat(props.language, { style: 'currency', currency: 'TWD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(amount)
const registrantFields = ['firstName', 'lastName', 'organization', 'email', 'address1', 'city', 'state', 'postalCode', 'country', 'phoneCountryCode', 'phone'] as const
const autocomplete = { firstName: 'given-name', lastName: 'family-name', organization: 'organization', email: 'email', address1: 'street-address', city: 'address-level2', state: 'address-level1', postalCode: 'postal-code', country: 'country', phoneCountryCode: 'tel-country-code', phone: 'tel-national' }
const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')
const countries = computed(() => { const names = new Intl.DisplayNames([props.language, 'en'], { type: 'region' }); return countryCodes.map(code => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, props.language)) })
watch(() => registrant.value.country, value => {
  const common: Record<string, string> = { TW: '886', US: '1', CA: '1', JP: '81', KR: '82', FR: '33', DE: '49', ES: '34', PT: '351', GB: '44', AU: '61', NZ: '64', SG: '65', HK: '852', IN: '91', BR: '55', AE: '971', SA: '966' }
  if (!registrant.value.phoneCountryCode && common[value]) registrant.value.phoneCountryCode = common[value]!
})
// Fill repeated contact details only while the customer has not independently changed them.
watch(() => contact.value.contactName, (value, previous) => { if (!registrant.value.firstName || registrant.value.firstName === previous) registrant.value.firstName = value })
watch(() => contact.value.email, (value, previous) => { if (!registrant.value.email || registrant.value.email === previous) registrant.value.email = value })
watch(() => `${domain.value.name}.${domain.value.tld}`, () => { availability.value = null; delegated.value = false; quote.value = null; reviewed.value = false; note.value = '' })
watch([contact, registrant, plan], () => { quote.value = null; reviewed.value = false }, { deep: true })
watch([agreed, delegated], () => { quote.value = null; reviewed.value = false })

async function work(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; note.value = ''
  try { await action() } catch (cause) { if (alive) error.value = t(studioLaunchErrorKind(cause)) }
  finally { if (alive) busy.value = false }
}
function readTerms() {
  const el = termsPane.value
  if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) read.value = true
}
async function checkDomain() {
  if (locked.value || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(domain.value.name)) { error.value = t('details'); return }
  const requested = { ...domain.value }
  await work(async () => {
    const result = await props.request<LaunchAvailability | { available: false }>('/domain-availability', { method: 'POST', body: { name: requested.name, tld: requested.tld } })
    if (!alive || requested.name !== domain.value.name || requested.tld !== domain.value.tld) return
    availability.value = result.available ? result : null
    note.value = result.available ? t('available') : t('unavailable')
  })
}
async function prepare() {
  if (!ready.value || locked.value) { error.value = t('details'); return }
  const input = { contact: { ...contact.value }, domain: { ...domain.value }, plan: { ...plan.value }, registrant: { ...registrant.value }, availability: { ...availability.value! }, consentRead: read.value, consentChecked: agreed.value, delegated: delegated.value }
  await work(async () => {
    const result = await prepareStudioLaunch(props.session, input, props.request, session => { if (alive) emit('saved', session) })
    if (!alive) return
    quote.value = result; note.value = t('saved')
    await nextTick(); quoteHeading.value?.focus({ preventScroll: true }); quoteHeading.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
  })
}
async function build() {
  if (!canBuild.value) return
  await work(async () => {
    const result = await props.request<{ previewUrl: string; quote: LaunchQuote }>('/build', { method: 'POST', body: {} })
    if (!alive) return
    previewUrl.value = result.previewUrl; quote.value = result.quote; reviewed.value = false
    emit('saved', await props.request<LaunchSession>('', { method: 'GET' }))
  })
}
async function checkout() {
  if (!reviewed.value || !previewUrl.value || !quote.value || paid.value || props.unactivatedModules.length) return
  await work(async () => {
    const result = await props.request<{ checkoutUrl: string }>('/checkout', { method: 'POST', body: {} })
    if (alive) window.location.assign(result.checkoutUrl)
  })
}
async function reload() {
  await work(async () => {
    const session = await props.request<LaunchSession>('', { method: 'GET' })
    if (!alive) return
    emit('saved', session)
    // Preserve unsaved input. A fresh quote never silently changes the selected domain.
    availability.value = launchAvailabilityCurrent(session.domainAvailability, domain.value.name, domain.value.tld) ? session.domainAvailability : null
    previewUrl.value = session.previewUrl || ''; reviewed.value = false
    const status = await props.request<{ order: { status: string } | null }>('/status', { method: 'GET' })
    if (!alive) return
    paid.value = status.order?.status === 'payment_verified'
    if (session.previewUrl || session.status === 'building' || session.studio?.buildStarted) quote.value = await props.request<LaunchQuote>('/quote', { method: 'POST', body: {} })
  })
}
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000); readTerms(); if (previewUrl.value || locked.value) void reload() })
onBeforeUnmount(() => { alive = false; clearInterval(timer) })
</script>

<template>
  <section class="launch-panel" :lang="language" :dir="siteTextDirection(language)" :aria-busy="busy">
    <ol class="journey"><li>✓ {{ t('idea') }}</li><li>✓ {{ t('review') }}</li><li aria-current="step">03 {{ t('launch') }}</li></ol>
    <header><p class="eyebrow">{{ session.answers.company?.brandName }}</p><h1>{{ t('title') }}</h1><p>{{ t('preserved') }}</p><button type="button" class="text" :disabled="busy || locked" @click="emit('back')">← {{ t('back') }}</button></header>
    <section v-if="unactivatedModules.length" class="notice" role="status"><h2>{{ t('functions') }}</h2><p>{{ t('functionBlock') }}</p><ul><li v-for="module in unactivatedModules" :key="module">{{ launchQuoteLabel({ lineKey: `module-${module}`, description: module, lineAmountMinor: 0, billing: 'one_time' }, language) }}</li></ul></section>
    <form v-if="!locked && !unactivatedModules.length" @submit.prevent="prepare">
      <fieldset :disabled="busy">
        <section class="card"><h2><span>01</span> {{ t('contact') }}</h2><div class="fields"><label>{{ t('name') }}<input v-model.trim="contact.contactName" required autocomplete="name" maxlength="120"></label><label>{{ t('email') }}<input v-model.trim="contact.email" type="email" required autocomplete="email" maxlength="320"></label></div></section>
        <section class="card"><h2><span>02</span> {{ t('domain') }}</h2>
          <div class="domain-fields"><label>{{ t('domainName') }}<input v-model.trim="domain.name" required pattern="[a-z0-9][a-z0-9-]{0,62}" maxlength="63" autocomplete="off" placeholder="your-brand"></label><label>{{ t('year') }}<select v-model="domain.tld"><option v-for="item in catalog.domainTlds" :key="item.tld" :value="item.tld">.{{ item.tld }} · {{ money(item.annualMinor) }}</option></select></label><button type="button" @click="checkDomain">{{ t('check') }}</button></div>
          <p v-if="availability" :class="{ error: !currentAvailability }" role="status">{{ currentAvailability ? t('available') : t('expired') }} · {{ availability.canonicalDomain }} · {{ money(availability.customerPrice.amountMinor) }}</p>
          <section v-if="availability" class="registrant"><h3>{{ t('owner') }}</h3><p>{{ t('ownerHelp') }}</p><div class="fields"><label v-for="key in registrantFields" :key="key">{{ t(key) }}<select v-if="key === 'country'" v-model="registrant.country" required autocomplete="country"><option value="" disabled>—</option><option v-for="country in countries" :key="country.code" :value="country.code">{{ country.name }}</option></select><input v-else v-model.trim="registrant[key]" :type="key === 'email' ? 'email' : 'text'" :inputmode="['phoneCountryCode', 'phone', 'postalCode'].includes(key) ? 'tel' : undefined" :required="!['lastName', 'organization', 'state'].includes(key)" :autocomplete="autocomplete[key]" :maxlength="key === 'phoneCountryCode' ? 4 : key === 'phone' ? 15 : key === 'email' ? 320 : 200"></label></div>
          <p class="terms-original">{{ studioDomainAuthorizationCopy(language, session.domainDelegationTerms) }}</p><label class="check"><input v-model="delegated" type="checkbox" required>{{ t('delegation') }}</label></section>
        </section>
        <section class="card"><h2><span>03</span> {{ t('plan') }}</h2><label v-for="item in catalog.plans.filter(item => item.key === 'site_only' || item.key === plan.planKey)" :key="item.key" class="plan"><input v-model="plan.planKey" type="radio" name="launch-plan" :value="item.key"><span>{{ t(item.key === 'site_only' ? 'basic' : item.key === 'site_geo' ? 'search' : 'content') }}</span><b v-if="item.monthlyMinor !== null">{{ money(item.monthlyMinor) }} / {{ t('month') }}</b></label>
          <details><summary>{{ t('options') }}</summary><label v-for="item in catalog.plans.filter(item => item.key !== 'site_only' && item.key !== plan.planKey)" :key="item.key" class="plan"><input v-model="plan.planKey" type="radio" name="launch-plan" :value="item.key"><span>{{ t(item.key === 'site_geo' ? 'search' : 'content') }}</span><b v-if="item.monthlyMinor !== null">{{ money(item.monthlyMinor) }} / {{ t('month') }}</b></label></details>
          <label v-if="plan.planKey === 'site_geo_autopost'">{{ t('days') }}<select v-model="plan.cadenceDays" required><option v-for="item in catalog.cadence" :key="item.days" :value="item.days">{{ item.days }} {{ t('days') }} · {{ money(item.monthlyMinor) }} / {{ t('month') }}</option></select></label>
        </section>
        <section class="card"><h2>{{ t('terms') }}</h2><div ref="termsPane" class="terms" tabindex="0" @scroll="readTerms"><p v-for="paragraph in studioAuthorizationCopy(language)" :key="paragraph">{{ paragraph }}</p></div><p>{{ t('read') }}</p><label class="check"><input v-model="agreed" type="checkbox" :disabled="!read" required>{{ t('agree') }}</label></section>
        <button type="submit" class="primary">{{ busy ? t('saving') : t('save') }} →</button><p class="help">{{ t('noCharge') }}</p>
      </fieldset>
    </form>
    <StudioInboxBinding v-if="session.answers.modules?.includes('contact_lead_capture') && !unactivatedModules.length" :language="language" :email="contact.email" :binding="session.contactInbox" :request="request" :disabled="busy" @saved="emit('saved', $event)" />
    <section v-if="quote" class="card quote"><h2 ref="quoteHeading" tabindex="-1">{{ t('price') }}</h2><dl><div v-for="line in quote.lines" :key="line.lineKey"><dt>{{ launchQuoteLabel(line, language) }}<small v-if="line.billing !== 'one_time'"> · {{ t(line.billing === 'monthly' ? 'month' : 'year') }}</small></dt><dd>{{ money(line.lineAmountMinor) }}</dd></div><div class="total"><dt>{{ t('today') }}</dt><dd>{{ money(quote.totals.dueTodayMinor) }}</dd></div><div><dt>{{ t('monthly') }}</dt><dd>{{ money(quote.totals.recurringMonthlyMinor) }}</dd></div><div><dt>{{ t('renewal') }}</dt><dd>{{ money(quote.totals.domainRenewalAnnualMinor) }}</dd></div></dl>
      <button v-if="!previewUrl" type="button" class="primary" :disabled="busy || !canBuild" @click="build">{{ busy ? t('saving') : t('build') }} →</button>
      <template v-else><a :href="previewUrl" target="_blank" rel="noopener noreferrer">{{ t('preview') }} ↗</a><p v-if="paid" role="status">{{ t('paid') }}</p><template v-else><label class="check"><input v-model="reviewed" type="checkbox" :disabled="busy">{{ t('reviewed') }}</label><button type="button" class="primary" :disabled="busy || !reviewed || unactivatedModules.length > 0" @click="checkout">{{ busy ? t('saving') : t('pay') }} →</button><p v-if="session.testMode">{{ t('test') }}</p></template></template>
    </section>
    <p v-if="note" role="status">{{ note }}</p><div v-if="error" class="error" role="alert"><p>{{ error }}</p><button type="button" :disabled="busy" @click="reload">{{ t('refresh') }}</button></div>
    <button v-if="locked && !quote" type="button" :disabled="busy" @click="reload">{{ t('refresh') }}</button>
  </section>
</template>

<style scoped>
h1{text-wrap:balance}
.launch-panel{max-width:1080px;margin:0 auto;padding:36px 0;color:#171a32;overflow-wrap:anywhere}.journey{display:flex;gap:12px;justify-content:space-between;padding:0 0 22px;border-bottom:1px solid #b7a88f66;list-style:none;font-size:12px}.journey li{opacity:.55}.journey [aria-current]{opacity:1}header{padding:40px 0}h1{font-family:Georgia,"Noto Serif TC",serif;font-weight:400;font-size:clamp(28px,4vw,48px);line-height:1.3;max-width:25ch}p{line-height:1.75}fieldset{border:0;padding:0;margin:0;min-width:0}.card{padding:clamp(20px,4vw,40px);background:#f8f5ef;border:1px solid #d5cfc3;margin-bottom:20px}.card h2{font-weight:500;font-size:22px;margin:0 0 24px}.card h2 span{font-size:12px;opacity:.45;margin-inline-end:16px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}label{display:grid;gap:8px;font-size:14px}input,select{box-sizing:border-box;width:100%;min-width:0;background:transparent;color:inherit;border:1px solid #b7a88f;padding:13px;font:inherit;border-radius:0}input[type=checkbox],input[type=radio]{width:18px;min-width:18px;height:18px;accent-color:#171a32}.domain-fields{display:grid;grid-template-columns:1.2fr 1fr auto;gap:16px;align-items:end}.registrant{margin-top:30px}.registrant>p{font-size:13px}.terms-original{max-height:160px;overflow:auto;padding:18px;background:#eee9df;line-height:1.8}.plan,.check{display:flex;align-items:center;gap:14px;margin-block:20px}.plan b{margin-inline-start:auto;font-size:13px}.plan span{flex:1}.check{align-items:flex-start;font-size:13px;line-height:1.7}.terms{max-height:220px;overflow:auto;font-size:13px;line-height:1.8;padding:20px;border:1px solid #d5cfc3}.terms p:first-child{margin-top:0}button,a,summary{min-height:44px;touch-action:manipulation}button{padding:12px 20px;font:inherit;cursor:pointer;color:inherit;background:transparent;border:1px solid #b7a88f}button:disabled{opacity:.45;cursor:not-allowed}.primary{width:100%;background:#171a32;color:#eee9df;padding:18px;border:0}.text{padding-inline:0;border:0;border-bottom:1px solid #b7a88f}.help{font-size:12px;text-align:center}.eyebrow{font-size:12px;letter-spacing:.12em}.notice{border-inline-start:3px solid #806648;padding:12px 24px;background:#e7dfd0;margin-bottom:24px}.notice h2{font-size:18px}.quote dl>div{display:flex;justify-content:space-between;gap:24px;padding:12px 0;font-size:14px}.quote dd{margin:0;white-space:nowrap}.quote .total{font-size:22px;border-block:1px solid #d5cfc3;margin-block:14px;padding-block:24px}.quote a{display:block;padding:16px 0;color:inherit}.error{color:#9c2c39}.error p{margin-bottom:8px}details{margin-top:20px}summary{cursor:pointer;padding-block:12px;font-size:13px}:focus-visible{outline:2px solid #171a32;outline-offset:4px}@media(max-width:650px){.fields,.domain-fields{grid-template-columns:1fr}.journey{font-size:11px;gap:8px}.plan{flex-wrap:wrap}.quote .total{font-size:19px}.launch-panel{padding-top:16px}header{padding-block:24px}.terms{max-height:260px}}
</style>
