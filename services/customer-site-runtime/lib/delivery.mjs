import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { fail } from './errors.mjs'
import { transaction } from './store.mjs'
import { customerLanguageSupported } from '../public/locale.mjs'

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
export const deliveryFingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const reject = () => fail(422, 'Invalid confirmed website package', 'DELIVERY_INVALID')
const hashPattern = /^[a-f0-9]{64}$/u
export function validateDelivery(value, config) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'approvedBlueprintHash,assets,bindings,contentHash,currency,design,engine,locale,preset,proposalId,schemaVersion,siteId') reject()
  const { contentHash, ...content } = value
  if (value.schemaVersion !== 'customer-site-approved-delivery-v1' || value.siteId !== config.siteId || value.engine !== config.siteType || value.currency !== config.currency || value.locale !== config.locale || value.preset !== config.preset || !hashPattern.test(value.proposalId) || !hashPattern.test(value.approvedBlueprintHash) || deliveryFingerprint(content) !== contentHash || deliveryFingerprint(value.design) !== deliveryFingerprint(config.design)) reject()
  if (!Array.isArray(value.assets) || value.assets.length < 1 || value.assets.length > 10 || Buffer.byteLength(JSON.stringify(value)) > 2_000_000 || !Array.isArray(value.bindings) || value.bindings.length > 30) reject()
  const paths = new Set()
  for (const asset of value.assets) {
    if (!asset || Object.keys(asset).sort().join(',') !== 'content,contentType,path' || !/^(?:index|(?:about|services|faq|contact|blog|shop|thanks)\/index)\.html$/u.test(asset.path) || paths.has(asset.path) || asset.contentType !== 'text/html; charset=utf-8' || typeof asset.content !== 'string' || !asset.content.startsWith('<!doctype html>')) reject()
    // First-party renderer emits no executable scripts. Defense in depth on import too.
    if (/<script\b|\son[a-z]+\s*=|javascript:|<iframe\b|<object\b|<base\b|<meta[^>]+http-equiv/iu.test(asset.content)) reject()
    paths.add(asset.path)
  }
  if (!paths.has('index.html')) reject()
  for (const binding of value.bindings) if (!binding || Object.keys(binding).sort().join(',') !== 'destination,label,sectionId' || !['/store', '/book', '/journal', '/inquiry'].includes(binding.destination) || typeof binding.sectionId !== 'string' || typeof binding.label !== 'string') reject()
  return structuredClone(value)
}

export function createDelivery(db, config, { initial, key = '', origin, durable = false, commerce, booking, payments, now = () => Date.now() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS site_deliveries (content_hash TEXT PRIMARY KEY, payload TEXT NOT NULL, approved_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS active_delivery (id INTEGER PRIMARY KEY CHECK(id=1), content_hash TEXT NOT NULL REFERENCES site_deliveries(content_hash));`)
  const current = () => {
    const row = db.prepare('SELECT payload FROM site_deliveries JOIN active_delivery USING(content_hash) WHERE active_delivery.id=1').get()
    return row ? validateDelivery(JSON.parse(row.payload), config) : null
  }
  // An exported preview may be opened locally. Production requires signed publication + readiness.
  if (initial && config.mode === 'preview' && !current()) {
    const delivery = validateDelivery(initial, config)
    transaction(db, () => {
      db.prepare('INSERT OR IGNORE INTO site_deliveries VALUES(?,?,?)').run(delivery.contentHash, JSON.stringify(delivery), new Date(now()).toISOString())
      db.prepare('INSERT INTO active_delivery VALUES(1,?)').run(delivery.contentHash)
    })
  }
  function blockers() {
    const result = []
    if (config.mode !== 'production') result.push('production_runtime_required')
    if (!durable) result.push('durable_storage_required')
    if (!customerLanguageSupported(config.locale)) result.push('transaction_language_pack_required')
    if (!config.policies?.privacy) result.push('privacy_policy_required')
    if (!config.contact?.email) result.push('merchant_contact_required')
    if (config.siteType === 'commerce') {
      if (!commerce.listProducts().length) result.push('catalog_required')
      if (!config.policies.shipping || !config.policies.returns) result.push('commerce_policies_required')
      if (!['manual', 'stripe_live'].includes(config.commerce.paymentMode)) result.push('production_payment_required')
      if (config.commerce.paymentMode === 'manual' && !config.commerce.manualPaymentInstructions) result.push('manual_payment_instructions_required')
      if (config.commerce.paymentMode === 'stripe_live' && !payments().configured) result.push('payment_credentials_required')
    } else if (!booking.listServices().length || !booking.listSlots().some(slot => slot.available)) result.push('bookable_service_and_slot_required')
    return result
  }
  function publish(raw, timestamp, signature) {
    if (!/^[A-Za-z0-9_-]{43,128}$/u.test(key) || !Buffer.isBuffer(raw) || raw.length > 2_000_000 || !/^\d{10,12}$/u.test(timestamp || '') || Math.abs(now() / 1000 - Number(timestamp)) > 300 || !hashPattern.test(signature || '')) fail(401, 'Publication authorization failed', 'DEPLOYMENT_AUTH_FAILED')
    const expected = createHmac('sha256', key).update(`${timestamp}.`).update(raw).digest()
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) fail(401, 'Publication authorization failed', 'DEPLOYMENT_AUTH_FAILED')
    let body
    try { body = JSON.parse(raw) } catch { reject() }
    if (!body || Object.keys(body).sort().join(',') !== 'delivery,origin,previousHash' || body.origin !== origin || (body.previousHash !== null && !hashPattern.test(body.previousHash))) reject()
    const delivery = validateDelivery(body.delivery, config)
    const missing = blockers()
    if (missing.length) fail(409, `Publication prerequisites: ${missing.join(', ')}`, 'PUBLICATION_NOT_READY')
    transaction(db, () => {
      const previous = current()
      if (previous?.contentHash === delivery.contentHash) return // Safe lost-response retry.
      if ((previous?.contentHash || null) !== body.previousHash) fail(409, 'Active website changed. Review before publishing.', 'PUBLICATION_CONFLICT')
      db.prepare('INSERT OR IGNORE INTO site_deliveries VALUES(?,?,?)').run(delivery.contentHash, JSON.stringify(delivery), new Date(now()).toISOString())
      db.prepare('INSERT INTO active_delivery VALUES(1,?) ON CONFLICT(id) DO UPDATE SET content_hash=excluded.content_hash').run(delivery.contentHash)
    })
    return { status: 'production_verified', siteId: config.siteId, origin, contentHash: delivery.contentHash }
  }
  function page(path) {
    const asset = current()?.assets.find(a => a.path === (path === '/' ? 'index.html' : `${path.replace(/^\//u, '')}/index.html`))
    if (!asset) return null
    return config.mode === 'production' ? asset.content.replace('<meta name="robots" content="noindex,nofollow">', '') : asset.content
  }
  return { publish, page, current, blockers }
}
