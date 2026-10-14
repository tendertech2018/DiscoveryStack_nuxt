import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { studioAcceptanceFingerprint as hash, studioAcceptanceLanguage as language } from './studio-acceptance-fingerprint.mjs'

// Explicit operator-only acceptance. No environment file, provider key, cookie or real customer data.
// The allowance is single-use per evidence directory. Failed attempts consume their reservation.
const [origin, outputPath, approval, resumeOption, priorLedgerPath] = process.argv.slice(2)
if (origin !== 'https://discoverystack-api.onrender.com' || !outputPath || approval !== '--approved-claude-usd-2') throw new Error('Explicit production origin, fresh evidence directory and approved USD 2 allowance required.')
let prior = null
if (resumeOption !== undefined || priorLedgerPath !== undefined) {
  if (resumeOption !== '--resume-booking-once' || !priorLedgerPath || process.argv.length !== 7) throw new Error('Only one explicitly budget-carried booking recheck is supported.')
  prior = JSON.parse(readFileSync(resolve(priorLedgerPath), 'utf8'))
  if (prior.schemaVersion !== 'studio-acceptance-v1' || prior.approvedUsd !== 2 || prior.attempts !== 2 || prior.reservedUsd !== 1.2 || prior.results?.length !== 2 || prior.results[0].scenario !== 'commerce' || prior.results[0].status !== 'AI_PROPOSAL_CONFIRMED_ONLY' || prior.results[1].scenario !== 'booking' || prior.results[1].reason !== 'ai_result_contract_failed') throw new Error('Previous two-attempt allowance could not be verified; no new call is permitted.')
}
const output = resolve(outputPath)
if (existsSync(output)) throw new Error('Use a new evidence directory; never overwrite or rerun a paid acceptance ledger.')
mkdirSync(output, { mode: 0o700 })
const ledger = { schemaVersion: 'studio-acceptance-v1', approvedUsd: 2, reservationPerAttemptUsd: 0.60, reservedUsd: 0, attempts: 0, actualBilledUsd: null, pricingCheckedAt: '2026-10-15', pricingSource: 'https://platform.claude.com/docs/en/about-claude/pricing', note: 'Reservation is not a bill. Maximum 100000 input bytes and 12288 output tokens; no tools or retries. USD 0.60 conservatively covers either allowed Sonnet model at verified prices.', results: [] }
if (prior) Object.assign(ledger, { attempts: prior.attempts, reservedUsd: prior.reservedUsd, carriedLedger: resolve(priorLedgerPath), carriedResults: prior.results, note: ledger.note + ' One explicit Chinese-language recheck after correcting case-sensitive acceptance logic. Prior reservations remain counted; no automatic retries.' })
const save = () => writeFileSync(join(output, 'acceptance.json'), JSON.stringify(ledger, null, 2), { mode: 0o600 })
save()
async function request(path, body, token) {
  const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(120000), headers: { accept: 'application/json', origin, 'content-type': 'application/json', 'x-managed-site-required-provider': 'anthropic', ...(token ? { 'x-managed-site-funnel-token': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`acceptance_http_${response.status}`) }
  const reader = response.body.getReader(), chunks = []; let size = 0
  try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 3000000) throw new Error('acceptance_response_too_large'); chunks.push(Buffer.from(item.value)) } } finally { await reader.cancel() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
const fixtures = [
  { key: 'commerce', facts: { brandName: 'Lumen Goods QA', offer: 'Synthetic acceptance brand only. We offer ceramic tableware and linen home accessories for people furnishing small apartments. Explain our selection clearly and guide shoppers through product discovery. No prices, stock, shipping promises, reviews or certification have been supplied; do not invent them.', audience: 'English-speaking customers furnishing small apartments', market: 'United States', goal: 'sell_online', siteType: 'simple_commerce', language: 'en', style: 'Quiet editorial design, warm ivory, charcoal type and generous white space.' } },
  { key: 'booking', facts: { brandName: '晴序練習室 QA', offer: '純驗收用的虛構品牌：提供初學者一對一瑜伽練習，讓訪客了解服務、常見問題並申請體驗預約。尚未提供價格、老師資歷、地址或可預約時段；不要編造，也不要宣稱能治療疾病。', audience: '第一次接觸瑜伽的成年人', market: '台灣', goal: 'increase_bookings', siteType: 'brand_blog', language: 'zh-Hant', style: '安靜親切的編輯式排版，米白與深綠，清楚的預約動線。' } },
]
for (const fixture of fixtures.filter(item => !prior || item.key === 'booking')) {
  try {
    const session = await request('/api/managed-sites/funnel/sessions', {})
    const root = `/api/managed-sites/funnel/sessions/${session.sessionId}`
    const ready = await request(root + '/studio-intake', { revision: 0, answers: fixture.facts }, session.sessionToken)
    if (ready.status !== 'ready' || !ready.brief || ready.providerUsed !== false) throw new Error('manual_intake_contract_failed')
    const offTopic = await request(root + '/studio-intake', { revision: ready.revision, message: 'Tell me a joke' }, session.sessionToken)
    if (offTopic.status !== 'off_topic' || offTopic.providerUsed !== false || hash(offTopic.facts) !== hash(ready.facts)) throw new Error('off_topic_guard_failed')
    if (ledger.attempts >= (prior ? 3 : 2) || ledger.reservedUsd + ledger.reservationPerAttemptUsd > ledger.approvedUsd) throw new Error('acceptance_budget_exhausted')
    ledger.attempts++; ledger.reservedUsd = Number((ledger.attempts * ledger.reservationPerAttemptUsd).toFixed(2)); save()
    console.log(JSON.stringify({ stage: 'claude_attempt_started', scenario: fixture.key, attempt: ledger.attempts, reservedUsd: ledger.reservedUsd }))
    const preview = await request(root + '/studio-preview', { ...ready.brief, mode: 'ai' }, session.sessionToken)
    ledger.lastObservedResult = { scenario: fixture.key, source: preview.source, language: preview.language, expectedLanguage: ready.brief.language, pageCount: preview.pages?.length || 0, hasProposal: Boolean(preview.proposalId) }; save()
    if (preview.source !== 'llm') throw new Error('ai_returned_template_not_accepted')
    if (!language(preview.language) || language(preview.language) !== language(ready.brief.language) || !preview.proposalId || !preview.pages?.length) throw new Error('ai_result_contract_failed')
    for (const page of preview.pages) for (const design of page.designs) {
      if (!/^[a-z_-]+$/.test(page.key) || !['atelier', 'bloom', 'alignment'].includes(design.preset)) throw new Error('invalid_artifact_name')
      writeFileSync(join(output, `${fixture.key}-${page.key}-${design.preset}.html`), design.html, { flag: 'wx', mode: 0o600 })
    }
    const confirmed = await request(root + '/studio-confirm', { proposalId: preview.proposalId, preset: 'atelier' }, session.sessionToken)
    const restored = await request(root + '/studio-draft', undefined, session.sessionToken)
    if (!confirmed.studio?.confirmed || hash(restored.preview.editContext) !== hash(preview.editContext) || restored.preview.proposalId !== preview.proposalId) throw new Error('confirmed_copy_changed')
    const result = { scenario: fixture.key, source: preview.source, language: preview.language, pageCount: preview.pages.length, approvedCopyHash: hash(preview.editContext), confirmedAndRestored: true, deliveryReview: preview.deliveryReview, publication: 'NOT_RUN', paidCustomerSiteHosting: 'NOT_AUTHORIZED', stripeAcceptance: 'NOT_RUN', status: 'AI_PROPOSAL_CONFIRMED_ONLY' }
    ledger.results.push(result); save(); console.log(JSON.stringify(result))
  } catch (error) {
    const reason = /^acceptance_http_\d+$|^[a-z_]+$/.test(error.message) ? error.message : 'acceptance_transport_or_response_failed'
    ledger.results.push({ scenario: fixture.key, status: 'FAILED', reason }); save()
    console.log(JSON.stringify({ scenario: fixture.key, status: 'FAILED', reason, attempts: ledger.attempts, reservedUsd: ledger.reservedUsd }))
    process.exitCode = 1; break // no paid retries or fallback success claims
  }
}
console.log(JSON.stringify({ stage: 'acceptance_finished', attempts: ledger.attempts, reservedUsd: ledger.reservedUsd, actualBilledUsd: null, evidencePath: join(output, 'acceptance.json') }))
