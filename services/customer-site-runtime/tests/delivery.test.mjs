import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { createDelivery, deliveryFingerprint, validateDelivery } from '../lib/delivery.mjs'
const key = 'synthetic-deployment-secret-for-isolated-test-0000000'
const origin = 'https://synthetic-runtime.onrender.com'
const config = { siteId: 'delivery-fixture', siteType: 'commerce', locale: 'en', currency: 'JPY', preset: 'atelier', mode: 'production', design: { canvas: '#ffffff', surface: '#ffffff', ink: '#111111', accent: '#aabbcc', typography: 'serif', motion: 'none' }, commerce: { paymentMode: 'manual', manualPaymentInstructions: 'Synthetic instructions' }, policies: { privacy: 'Synthetic privacy', shipping: 'Synthetic delivery', returns: 'Synthetic returns' }, contact: { email: 'fixture@example.invalid' } }
const bundle = (text = 'Confirmed design') => {
  const value = { schemaVersion: 'customer-site-approved-delivery-v1', siteId: config.siteId, proposalId: 'a'.repeat(64), approvedBlueprintHash: 'b'.repeat(64), preset: config.preset, locale: config.locale, currency: config.currency, engine: config.siteType, design: config.design, bindings: [], assets: [{ path: 'index.html', contentType: 'text/html; charset=utf-8', content: `<!doctype html><html><head><meta name="robots" content="noindex,nofollow"></head><body>${text}</body></html>` }] }
  return { ...value, contentHash: deliveryFingerprint(value) }
}
function signed(delivery, previousHash = null) {
  const raw = Buffer.from(JSON.stringify({ delivery, origin, previousHash }))
  const time = String(Math.floor(Date.now() / 1000))
  return [raw, time, createHmac('sha256', key).update(`${time}.`).update(raw).digest('hex')]
}
test('publication is signed, content-bound, readiness-gated, atomic and replay-safe', () => {
  const db = new DatabaseSync(':memory:')
  try {
    let catalog = []
    const options = { key, origin, durable: true, commerce: { listProducts: () => catalog }, payments: () => ({ configured: false }) }
    const d = createDelivery(db, config, options), first = bundle()
    assert.throws(() => d.publish(...signed(first)), /catalog_required/)
    assert.equal(d.current(), null)
    catalog = [{ id: 'synthetic' }]
    assert.throws(() => d.publish(signed(first)[0], signed(first)[1], '0'.repeat(64)))
    assert.throws(() => d.publish(...signed({ ...first, siteId: 'other-tenant' })))
    assert.equal(d.publish(...signed(first)).status, 'production_verified')
    assert.equal(d.publish(...signed(first)).contentHash, first.contentHash)
    assert.equal(db.prepare('SELECT count(*) AS n FROM site_deliveries').get().n, 1)
    assert.match(d.page('/'), /Confirmed design/)
    assert.doesNotMatch(d.page('/'), /noindex/)
    const second = bundle('New approved design')
    assert.throws(() => d.publish(...signed(second)), /Active website changed/)
    assert.equal(d.current().contentHash, first.contentHash)
    d.publish(...signed(second, first.contentHash))
    assert.match(d.page('/'), /New approved design/)
    assert.equal(db.prepare('SELECT count(*) AS n FROM site_deliveries').get().n, 2)
  } finally { db.close() }
})
test('tampered assets, executable markup, currency changes and duplicate paths are refused', () => {
  assert.throws(() => validateDelivery({ ...bundle(), currency: 'USD' }, config))
  assert.throws(() => validateDelivery(bundle('<script>alert(1)</script>'), config))
  const duplicate = bundle(); duplicate.assets.push(duplicate.assets[0])
  const { contentHash, ...data } = duplicate
  duplicate.contentHash = deliveryFingerprint(data)
  assert.throws(() => validateDelivery(duplicate, config))
})
test('preview exports never self-publish in production, and ephemeral storage is blocked', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const d = createDelivery(db, config, { initial: bundle(), key, origin, durable: false, commerce: { listProducts: () => [{}] }, payments: () => ({ configured: true }) })
    assert.equal(d.current(), null)
    assert.throws(() => d.publish(...signed(bundle())), /durable_storage_required/)
  } finally { db.close() }
})
