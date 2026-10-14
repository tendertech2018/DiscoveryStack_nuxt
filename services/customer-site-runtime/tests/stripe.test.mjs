import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { createCommerce } from '../lib/commerce.mjs'
import { createStripePayments, verifyStripeEvent } from '../lib/stripe.mjs'
import { parseConfig } from '../lib/config.mjs'

const signing = 'whsec_fixtureOnlyNotReal0000'
function signed(event, time = Date.now()) {
  const raw = Buffer.from(JSON.stringify(event)), timestamp = Math.floor(time / 1000)
  return [raw, `t=${timestamp},v1=${createHmac('sha256', signing).update(`${timestamp}.`).update(raw).digest('hex')}`]
}
function fixture(t, extra = {}, currency = 'TWD') {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close())
  const config = parseConfig({ siteId: 'stripe-fixture', siteType: 'commerce', brandName: 'Synthetic store', mode: 'preview', currency, commerce: { paymentMode: 'stripe_test' } })
  const commerce = createCommerce(db, config)
  const item = commerce.saveProduct({ name: 'Fixture', slug: 'fixture', category: 'fixture', description: 'Synthetic only', priceMinor: 10000, stock: 4, active: true, images: [] })
  const order = commerce.createOrder({ customer: { name: 'Synthetic', email: 'fixture@example.invalid', phone: '0900000000', address: 'Synthetic address' }, items: [{ productId: item.id, quantity: 1 }], consent: true, idempotencyKey: 'stripe-fixture-order' })
  const calls = []
  const payments = createStripePayments(db, commerce, config, { secretKey: 'sk_test_fixtureOnlyNotReal0000', webhookSecret: signing, origin: 'https://fixture.example', fetchImpl: async (url, options) => {
    const form = new URLSearchParams(options.body); calls.push({ url, options, form })
    return Response.json({ object: 'checkout.session', id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/cs_test_fixture', client_reference_id: order.id, metadata: { siteId: config.siteId, attemptId: form.get('metadata[attemptId]') }, amount_total: order.totalMinor, currency: currency.toLowerCase(), mode: 'payment', livemode: false })
  }, ...extra })
  const event = (overrides = {}, type = 'checkout.session.completed', eventId = 'evt_fixture') => ({ id: eventId, type, livemode: false, data: { object: { object: 'checkout.session', id: 'cs_test_fixture', status: 'complete', payment_status: 'paid', payment_intent: 'pi_fixture', mode: 'payment', livemode: false, amount_total: order.totalMinor, currency: 'twd', client_reference_id: order.id, metadata: { siteId: config.siteId, attemptId: db.prepare('SELECT attempt_id FROM stripe_checkouts').get()?.attempt_id }, ...overrides } } })
  return { db, commerce, item, order, payments, calls, event }
}

test('checkout owns amount, URL and idempotency; redirects never confirm payment', async t => {
  const f = fixture(t)
  assert.ok(Date.parse(f.order.expiresAt) - Date.now() > 39 * 60000)
  await assert.rejects(f.payments.checkout(f.order.id, 'wrong-token'))
  const first = await f.payments.checkout(f.order.id, f.order.accessToken)
  assert.equal(first.mode, 'test')
  assert.deepEqual(await f.payments.checkout(f.order.id, f.order.accessToken), first)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].url, 'https://api.stripe.com/v1/checkout/sessions')
  assert.equal(f.calls[0].form.get('line_items[0][price_data][unit_amount]'), String(f.order.totalMinor))
  assert.equal(f.calls[0].options.redirect, 'error')
  assert.equal(f.commerce.getOrder(f.order.id, f.order.accessToken).paymentStatus, 'pending')
  assert.throws(() => f.commerce.transitionOrder(f.order.id, { action: 'confirm_manual_payment', reference: 'fake' }))
})
for (const currency of ['JPY', 'USD', 'EUR', 'KRW']) test(`Stripe receives server-owned integer charge units for ${currency}`, async t => {
  const f = fixture(t, {}, currency)
  await f.payments.checkout(f.order.id, f.order.accessToken)
  assert.equal(f.calls[0].form.get('line_items[0][price_data][currency]'), currency.toLowerCase())
  assert.equal(f.calls[0].form.get('line_items[0][price_data][unit_amount]'), String(f.order.totalMinor))
  assert.equal(f.order.currency, currency)
})

test('signed payment is atomic, replay-safe, tenant-bound and cannot be manually refunded', async t => {
  const f = fixture(t); await f.payments.checkout(f.order.id, f.order.accessToken)
  for (const change of [{ amount_total: 1 }, { currency: 'usd' }, { livemode: true }, { metadata: { siteId: 'different-site', attemptId: 'different' } }, { client_reference_id: 'wrong' }]) {
    assert.throws(() => f.payments.webhook(...signed(f.event(change))))
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM stripe_events').get().n, 0)
  }
  const bytes = signed(f.event())
  f.payments.webhook(...bytes)
  assert.equal(f.payments.webhook(...bytes).replayed, true)
  assert.equal(f.commerce.getOrder(f.order.id, f.order.accessToken).paymentStatus, 'paid')
  assert.equal(f.commerce.getProduct(f.item.slug).stock, 3)
  assert.throws(() => f.payments.webhook(...signed({ ...f.event(), extra: 'different body same id' })))
  assert.throws(() => f.commerce.transitionOrder(f.order.id, { action: 'refund', reference: 'manual' }), e => e.code === 'PROVIDER_REFUND_REQUIRED')
})

test('stale, modified and unsigned bytes are refused, including already seen IDs', () => {
  const input = { id: 'evt_signature', type: 'unused', livemode: false, data: { object: {} } }
  const [raw, signature] = signed(input)
  assert.equal(verifyStripeEvent(raw, signature, signing).id, input.id)
  assert.throws(() => verifyStripeEvent(Buffer.concat([raw, Buffer.from(' ')]), signature, signing))
  assert.throws(() => verifyStripeEvent(raw, signature, signing, Date.now() + 301000))
  assert.throws(() => verifyStripeEvent(raw, signature + ',t=1760000000', signing))
  assert.throws(() => verifyStripeEvent(raw, '', signing))
})

test('late payment after expiration is quarantined without reselling or replenishing twice', async t => {
  const f = fixture(t); await f.payments.checkout(f.order.id, f.order.accessToken)
  f.payments.webhook(...signed(f.event({ status: 'expired', payment_status: 'unpaid' }, 'checkout.session.expired', 'evt_expired')))
  f.payments.webhook(...signed(f.event({ status: 'expired', payment_status: 'unpaid' }, 'checkout.session.expired', 'evt_expired_again')))
  assert.equal(f.commerce.getProduct(f.item.slug).stock, 4)
  f.payments.webhook(...signed(f.event()))
  const order = f.commerce.getOrder(f.order.id, f.order.accessToken)
  assert.equal(order.paymentStatus, 'review_required'); assert.equal(order.fulfillmentStatus, 'cancelled')
  assert.throws(() => f.commerce.transitionOrder(f.order.id, { action: 'ship', carrier: 'Fixture', trackingNumber: '123' }))
})

test('signed full and partial refunds, out-of-order delivery, no payment downgrade', async t => {
  const f = fixture(t); await f.payments.checkout(f.order.id, f.order.accessToken)
  const refund = (amount, id) => ({ id, type: 'charge.refunded', livemode: false, data: { object: { object: 'charge', id: 'ch_fixture', payment_intent: 'pi_fixture', livemode: false, currency: 'twd', amount: 10000, amount_refunded: amount, refunded: amount === 10000 } } })
  assert.throws(() => f.payments.webhook(...signed(refund(10000, 'evt_refund_early'))), e => e.code === 'PAYMENT_RECONCILIATION_PENDING')
  f.payments.webhook(...signed(f.event()))
  f.payments.webhook(...signed(refund(1000, 'evt_partial')))
  assert.equal(f.commerce.getOrder(f.order.id, f.order.accessToken).paymentStatus, 'review_required')
  f.payments.webhook(...signed(refund(10000, 'evt_full')))
  f.payments.webhook(...signed(f.event({}, undefined, 'evt_late_paid')))
  f.payments.webhook(...signed(refund(10000, 'evt_full_retry')))
  assert.equal(f.commerce.getOrder(f.order.id, f.order.accessToken).paymentStatus, 'refunded')
  assert.equal(f.commerce.getProduct(f.item.slug).stock, 4)
})

test('missing/wrong-mode credentials, hostile checkout URLs and provider failures stay closed', async t => {
  for (const extra of [{ secretKey: 'sk_live_fixtureOnlyNotReal0000' }, { webhookSecret: '' }, { fetchImpl: async () => Response.json({ url: 'https://evil.example' }) }, { fetchImpl: async () => { throw new Error('secret must never escape') } }]) {
    const f = fixture(t, extra)
    await assert.rejects(f.payments.checkout(f.order.id, f.order.accessToken), e => e.code === 'PAYMENT_PROVIDER_UNAVAILABLE' && !e.message.includes('secret'))
    assert.equal(f.commerce.getOrder(f.order.id, f.order.accessToken).paymentStatus, 'pending')
  }
})
