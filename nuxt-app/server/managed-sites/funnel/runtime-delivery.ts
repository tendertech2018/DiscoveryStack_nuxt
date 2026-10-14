import { createHmac } from 'node:crypto'
import { createError } from 'h3'
import type { ManagedSiteFunnelSession } from '../../database/schema'
import { managedSiteStableFingerprint as fingerprint } from '../live-connectors/canonical'
import { renderManagedSiteStaticAssets } from '../live-connectors/internal-broker/static-renderer'
import { confirmedStudioProposal } from './studio-state'
import { funnelSessionRevision, type FunnelSessionRepository } from './session-repository'
import { customerRuntimeManifest } from '../customer-runtime'
import { funnelSiteSpec } from './quote-projection'
import type { FunnelAnswers } from './session-service'
import { htmlSiteLanguage } from '../../../utils/managedSiteLanguage'

export const RUNTIME_CURRENCIES = ['TWD', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'VND', 'HKD', 'SGD', 'AUD', 'CAD', 'NZD', 'CHF', 'CNY', 'THB', 'MYR', 'PHP', 'INR', 'IDR', 'AED', 'SAR', 'BRL', 'MXN'] as const
export type RuntimeChoices = { engine: 'commerce' | 'booking_blog'; currency: string; timeZone: string }
export type RuntimeDeliveryState = { choices: RuntimeChoices; proposalId: string; packageFingerprint: string; publishing?: boolean; publication?: { origin: string; contentHash: string; verifiedAt: string } }
function fail(statusCode: number, code: string): never { throw createError({ statusCode, statusMessage: code, data: { code } }) }
const escape = (value: string) => value.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function choices(value: unknown): RuntimeChoices {
  const v = value as RuntimeChoices
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['engine', 'currency', 'timeZone'].includes(k)) || !['commerce', 'booking_blog'].includes(v.engine) || !RUNTIME_CURRENCIES.includes(v.currency as any) || typeof v.timeZone !== 'string' || v.timeZone.length > 80) fail(422, 'RUNTIME_MARKET_REQUIRED')
  try { new Intl.DateTimeFormat('en', { timeZone: v.timeZone }) } catch { fail(422, 'RUNTIME_TIMEZONE_INVALID') }
  return { engine: v.engine, currency: v.currency, timeZone: v.timeZone }
}

/** Uses only the token-bound, server-persisted confirmation. No new LLM call. */
export function confirmedRuntimePackage(session: ManagedSiteFunnelSession, input: unknown) {
  if (session.projectId || session.releaseId || session.draftOrderId || session.status !== 'active') fail(409, 'RUNTIME_EXISTING_ORDER_REQUIRES_REVIEW')
  const settings = choices(input)
  const answers = session.answers as FunnelAnswers
  const proposal = confirmedStudioProposal(session.id, answers)
  if (!proposal?.blueprint.studioPresentation) fail(409, 'RUNTIME_CONFIRMED_DESIGN_REQUIRED')
  if (proposal.brief.goal === 'sell_online' && settings.engine !== 'commerce' || proposal.brief.goal === 'increase_bookings' && settings.engine !== 'booking_blog') fail(422, 'RUNTIME_ENGINE_MISMATCH')
  const original = proposal.blueprint
  const blueprint = structuredClone(original)
  const unsupported = blueprint.selectedModulePlacements.filter(item => !['shopify_commerce', 'google_booking_assisted_integration', 'contact_lead_capture', 'blog_cms'].includes(item.moduleKey)).map(item => item.moduleKey)
  if (unsupported.length) fail(409, 'RUNTIME_UNSUPPORTED_MODULE')
  const preset = answers.studio!.confirmed!.preset
  const spec = funnelSiteSpec(answers, session.id)
  const base = customerRuntimeManifest(spec, { ownerUserId: 1, projectId: session.id, versionId: 1 }, { engine: settings.engine, mode: 'preview' })
  const design = original.studioPresentation!.design
  const home = original.pages.find(p => p.pageKey === 'home')!
  const config = {
    ...base.config, siteId: `ds-funnel-${session.id}`, preset,
    brandName: original.brandName, tagline: home.title.slice(0, 240), description: home.description.slice(0, 2000),
    locale: htmlSiteLanguage(original.locale), currency: settings.currency,
    design: { canvas: design.canvas, surface: design.surface, ink: design.ink, accent: design.accent, typography: design.typography, motion: design.motion },
    hero: { ...base.config.hero, title: home.title, description: home.description.slice(0, 800) },
    about: original.pages.find(p => p.pageKey === 'about')?.sections.map(s => s.body).join('\n\n').slice(0, 8000) || home.description,
    commerce: { ...base.config.commerce, currency: settings.currency }, booking: { ...base.config.booking, timeZone: settings.timeZone },
  }
  // Bind only function slots. Approved titles, body, photography and design stay unchanged.
  const bindings: Array<{ sectionId: string; destination: string; label: string }> = []
  for (const page of blueprint.pages) for (const section of page.sections) {
    if (!['module_slot', 'contact_form'].includes(section.kind)) continue
    const destination = section.kind === 'contact_form' || section.moduleKey === 'contact_lead_capture' ? '/inquiry' : section.moduleKey === 'shopify_commerce' ? '/store' : section.moduleKey === 'blog_cms' ? '/journal' : '/book'
    if (destination === '/store' && settings.engine !== 'commerce' || destination === '/book' && settings.engine !== 'booking_blog') fail(409, 'RUNTIME_ENGINE_MISMATCH')
    bindings.push({ sectionId: section.sectionId, destination, label: section.ctaLabel || page.title })
    // Keep the approved copy, with a first-party destination instead of a disabled demo.
    section.kind = 'summary'; section.formEndpoint = null; section.ctaHref = destination; section.ctaLabel = section.ctaLabel || page.title
  }
  const assets = renderManagedSiteStaticAssets(blueprint, [], undefined, preset).filter(a => a.contentType.startsWith('text/html')).map(asset => ({
    ...asset,
    content: asset.content.replace('</body>', `<aside class="runtime-access" style="position:relative;display:flex;flex-wrap:wrap;gap:1rem;padding:1.5rem;justify-content:center"><a href="${settings.engine === 'commerce' ? '/store' : '/book'}">${escape(bindings.find(b => b.destination === (settings.engine === 'commerce' ? '/store' : '/book'))?.label || home.title)}</a><a href="/inquiry">${escape(original.studioPresentation!.chrome.contact)}</a></aside></body>`),
  }))
  const delivery = {
    schemaVersion: 'customer-site-approved-delivery-v1', siteId: config.siteId, proposalId: proposal.id,
    approvedBlueprintHash: fingerprint(original), preset, locale: config.locale, currency: config.currency, engine: config.siteType,
    design: config.design, bindings, assets,
  }
  const approvedDelivery = { ...delivery, contentHash: fingerprint(delivery) }
  const manifest = { ...base, config, lineage: { funnelSessionId: session.id, approvedProposalId: proposal.id, approvedBlueprintHash: delivery.approvedBlueprintHash }, approvedDelivery,
    launch: { ...base.launch, status: 'approved_design_bound', blocker: 'dedicated_runtime_host_required', message: 'Confirmed design is connected to native shopping / booking routes. A dedicated durable host and operational verification are required before publication.' },
    isolation: { ...base.isolation, databasePath: `/data/${config.siteId}/site.sqlite`, mediaPath: `/data/${config.siteId}/uploads` },
  }
  const { manifestFingerprint: _previous, ...content } = manifest
  return { ...content, manifestFingerprint: fingerprint(content) }
}

export async function prepareFunnelRuntime(session: ManagedSiteFunnelSession, input: unknown, repository: FunnelSessionRepository) {
  const manifest = confirmedRuntimePackage(session, input)
  const answers = session.answers as FunnelAnswers
  const previous = answers.runtimeDelivery
  if (previous?.publishing) fail(409, 'RUNTIME_RELEASE_LOCKED')
  if (previous?.publication && previous.packageFingerprint !== manifest.manifestFingerprint) fail(409, 'RUNTIME_PUBLISHED_SETTINGS_LOCKED')
  const runtimeDelivery: RuntimeDeliveryState = { choices: choices(input), proposalId: manifest.lineage.approvedProposalId, packageFingerprint: manifest.manifestFingerprint, ...(previous?.publication ? { publication: previous.publication } : {}) }
  if (!await repository.transitionSession(session.id, 'active', { answers: { ...answers, runtimeDelivery } }, funnelSessionRevision(session))) fail(409, 'RUNTIME_CONFIRMATION_CHANGED')
  return manifest
}

export function restoreFunnelRuntimePackage(session: ManagedSiteFunnelSession) {
  const state = (session.answers as FunnelAnswers).runtimeDelivery
  if (!state) fail(404, 'RUNTIME_PACKAGE_NOT_PREPARED')
  const manifest = confirmedRuntimePackage(session, state.choices)
  if (manifest.manifestFingerprint !== state.packageFingerprint) fail(409, 'RUNTIME_CONFIRMATION_CHANGED')
  return manifest
}

type Target = { sessionId: number; origin: string; secretEnv: string; enabled: boolean }
async function smallJson(response: Response) {
  if (!response.ok || response.redirected || Number(response.headers.get('content-length')) > 4096) { await response.body?.cancel(); fail(502, 'RUNTIME_PUBLICATION_NOT_VERIFIED') }
  const reader = response.body?.getReader()
  if (!reader) fail(502, 'RUNTIME_PUBLICATION_NOT_VERIFIED')
  const chunks: Uint8Array[] = []; let length = 0
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 4096) { await reader.cancel(); fail(502, 'RUNTIME_PUBLICATION_NOT_VERIFIED') }; chunks.push(part.value) }
    return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
  } catch { fail(502, 'RUNTIME_PUBLICATION_NOT_VERIFIED') } finally { reader.releaseLock() }
}
function runtimeTarget(sessionId: number): { origin: string; key: string } | null {
  let list: Target[]
  try { list = JSON.parse(process.env.MANAGED_SITE_RUNTIME_TARGETS_JSON || '[]') } catch { fail(503, 'RUNTIME_TARGET_CONFIG_INVALID') }
  if (!Array.isArray(list)) fail(503, 'RUNTIME_TARGET_CONFIG_INVALID')
  const matches = list.filter(t => t.sessionId === sessionId && t.enabled === true)
  if (!matches.length) return null
  if (matches.length !== 1) fail(503, 'RUNTIME_TARGET_CONFIG_INVALID')
  const target = matches[0]!
  // Only explicitly provisioned Render merchant hosts; no client URL, local network or redirect.
  if (!/^https:\/\/[a-z0-9][a-z0-9-]+\.onrender\.com$/u.test(target.origin) || !/^SITE_RUNTIME_DEPLOY_KEY_[A-Z0-9_]+$/u.test(target.secretEnv)) fail(503, 'RUNTIME_TARGET_CONFIG_INVALID')
  const key = process.env[target.secretEnv] || ''
  if (!/^[A-Za-z0-9_-]{43,128}$/u.test(key)) fail(503, 'RUNTIME_TARGET_KEY_MISSING')
  return { origin: target.origin, key }
}

export function funnelRuntimeStatus(session: ManagedSiteFunnelSession) {
  const state = (session.answers as FunnelAnswers)?.runtimeDelivery
  return { prepared: Boolean(state), choices: state?.choices || null, packageFingerprint: state?.packageFingerprint || null, publishing: state?.publishing || false, publication: state?.publication || null, hostingConfigured: Boolean(runtimeTarget(session.id)), buysHosting: false, chargesCard: false }
}

/** Existing merchant hosts only. No provision/buy call and no payment authority is synthesized. */
export async function publishFunnelRuntime(session: ManagedSiteFunnelSession, requestedFingerprint: unknown, repository: FunnelSessionRepository, fetchImpl = fetch) {
  const state = (session.answers as FunnelAnswers).runtimeDelivery
  if (!state || state.packageFingerprint !== requestedFingerprint) fail(409, 'RUNTIME_CONFIRMATION_CHANGED')
  const manifest = confirmedRuntimePackage(session, state.choices)
  if (manifest.manifestFingerprint !== state.packageFingerprint) fail(409, 'RUNTIME_CONFIRMATION_CHANGED')
  const target = runtimeTarget(session.id)
  if (!target) fail(409, 'RUNTIME_HOST_NOT_CONFIGURED')
  // Freeze confirmation before any external side effect. On uncertain failure keep it locked;
  // a retry reconciles the same hash, never silently publishes a newer proposal.
  const claimed = await repository.transitionSession(session.id, 'active', { answers: { ...(session.answers as FunnelAnswers), runtimeDelivery: { ...state, publishing: true } } }, funnelSessionRevision(session))
  if (!claimed) fail(409, 'RUNTIME_CONFIRMATION_CHANGED')
  const body = JSON.stringify({ origin: target.origin, delivery: manifest.approvedDelivery, previousHash: state.publication?.contentHash || null })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', target.key).update(`${timestamp}.`).update(body).digest('hex')
  const response = await fetchImpl(`${target.origin}/api/deployment`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'content-type': 'application/json', 'x-site-deploy-time': timestamp, 'x-site-deploy-signature': signature }, body })
  const receipt = await smallJson(response)
  if (receipt.siteId !== manifest.config.siteId || receipt.contentHash !== manifest.approvedDelivery.contentHash || receipt.origin !== target.origin || receipt.status !== 'production_verified') fail(502, 'RUNTIME_PUBLICATION_NOT_VERIFIED')
  // Read back what is actually being served, not merely a successful POST response.
  const verify = await fetchImpl(`${target.origin}/health`, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
  const observed = await smallJson(verify)
  if (!verify.ok || observed.deliveryHash !== receipt.contentHash || observed.siteId !== receipt.siteId || observed.mode !== 'production') fail(502, 'RUNTIME_PUBLICATION_NOT_VERIFIED')
  const publication = { origin: target.origin, contentHash: receipt.contentHash as string, verifiedAt: new Date().toISOString() }
  if (!await repository.transitionSession(session.id, 'active', { answers: { ...(session.answers as FunnelAnswers), runtimeDelivery: { ...state, publishing: false, publication } } }, funnelSessionRevision(claimed))) fail(409, 'RUNTIME_CONFIRMATION_CHANGED')
  return { publication, paymentVerified: false, customerDataMigrated: false }
}
