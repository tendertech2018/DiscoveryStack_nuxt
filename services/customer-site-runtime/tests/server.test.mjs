import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createHmac } from 'node:crypto'
import { createSiteRuntime } from '../server.mjs'
import { seedPreview } from '../lib/seed.mjs'
const origin = 'http://127.0.0.1:3002'
function fixture(type = 'commerce') { const runtime = createSiteRuntime({ config: { siteId: 'server-test', siteType: type, mode: 'preview', brandName: '測試品牌', commerce: { paymentMode: 'manual' } }, origin, adminPassword: 'local-fixture-admin-password' }); seedPreview(runtime); return runtime }
async function call(runtime, path, { method = 'GET', body, headers = {}, cookie, csrf } = {}) {
  const bytes = body === undefined ? '' : JSON.stringify(body)
  const request = Readable.from(bytes ? [Buffer.from(bytes)] : []); request.url = path; request.method = method; request.socket = { remoteAddress: '127.0.0.1' }; request.headers = { host: '127.0.0.1:3002', origin, 'content-type': 'application/json', ...headers, ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) }
  const result = { statusCode: 200, headers: {}, data: '' }; const response = { set statusCode(value) { result.statusCode = value }, get statusCode() { return result.statusCode }, setHeader(name, value) { result.headers[name.toLowerCase()] = value }, end(value) { result.data = value?.toString() || '' } }
  await runtime.handle(request, response)
  if (result.headers['content-type']?.startsWith('application/json')) result.json = JSON.parse(result.data)
  return result
}
async function session(runtime) { const r = await call(runtime, '/api/session'); return { cookie: r.headers['set-cookie'].split(';')[0], csrf: r.json.csrfToken } }
test('Stripe webhook is signature-only; missing configuration blocks inventory reservation and checkout UI', async () => {
  const config = { siteId: 'stripe-http', siteType: 'commerce', mode: 'preview', brandName: 'Synthetic', commerce: { paymentMode: 'stripe_test' } }
  const r = createSiteRuntime({ config, origin })
  try {
    seedPreview(r); const s = await session(r)
    const stock = r.commerce.listProducts()[0].stock
    const created = await call(r, '/api/orders', { ...s, method: 'POST', body: { items: [] } })
    assert.equal(created.statusCode, 503); assert.equal(r.commerce.listProducts()[0].stock, stock)
    assert.match((await call(r, '/checkout')).data, /type="submit" disabled/)
    assert.equal((await call(r, '/api/payments/stripe/webhook', { method: 'POST', body: {} })).statusCode, 503)
  } finally { r.close() }
  const secret = 'whsec_fixtureOnlyNotReal0000'
  const ready = createSiteRuntime({ config, origin, stripe: { secretKey: 'sk_test_fixtureOnlyNotReal0000', webhookSecret: secret, fetchImpl: () => { throw new Error('No external calls allowed') } } })
  try {
    const body = { id: 'evt_http_fixture', type: 'unused.event', livemode: false, data: { object: {} } }
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex')}`
    assert.equal((await call(ready, '/api/payments/stripe/webhook', { method: 'POST', body, headers: { origin: undefined } })).statusCode, 400)
    const result = await call(ready, '/api/payments/stripe/webhook', { method: 'POST', body, headers: { origin: undefined, 'stripe-signature': signature } })
    assert.equal(result.statusCode, 200); assert.equal(result.json.ignored, true)
    assert.equal((await call(ready, '/api/contact', { method: 'POST', body, headers: { origin: undefined, 'stripe-signature': signature } })).statusCode, 403)
    assert.match((await call(ready, '/checkout')).data, /Stripe 測試環境/)
    assert.equal((await call(ready, '/api/admin/settings')).statusCode, 401)
  } finally { ready.close() }
})
test('merchant test-key form is administrator-only, CSRF protected and never returns secrets', async () => {
  const r = createSiteRuntime({ config: { siteId: 'secret-http', siteType: 'commerce', mode: 'preview', locale: 'en', brandName: 'Synthetic', commerce: { paymentMode: 'disabled' } }, origin, adminPassword: 'synthetic-admin-password', sessionSecret: 'synthetic-encryption-secret-long-enough-000' })
  try {
    const s = await session(r)
    const body = { secretKey: 'sk_test_syntheticNotReal000000', webhookSecret: 'whsec_syntheticNotReal000000' }
    assert.equal((await call(r, '/api/admin/stripe-test', { ...s, method: 'POST', body })).statusCode, 401)
    const login = await call(r, '/api/admin/login', { ...s, method: 'POST', body: { password: 'synthetic-admin-password' } })
    const a = { cookie: login.headers['set-cookie'].split(';')[0], csrf: login.json.csrfToken }
    assert.equal((await call(r, '/api/admin/stripe-test', { cookie: a.cookie, method: 'POST', body })).statusCode, 403)
    const saved = await call(r, '/api/admin/stripe-test', { ...a, method: 'POST', body })
    assert.equal(saved.statusCode, 200)
    assert.deepEqual(saved.json, { configured: true, mode: 'test', verified: false })
    const settings = await call(r, '/api/admin/settings', a)
    assert.ok(!settings.data.includes(body.secretKey)); assert.ok(!settings.data.includes(body.webhookSecret))
    const page = await call(r, '/admin', a)
    assert.match(page.data, /data-stripe-test-form/)
    assert.match(page.data, /name="secretKey" type="password"/)
    assert.ok(!page.data.includes(body.secretKey))
    assert.equal((await call(r, '/api/admin/stripe-test', a)).statusCode, 404)
    assert.equal((await call(r, '/assets/customer-languages.mjs')).statusCode, 200)
  } finally { r.close() }
})
test('guest booking receipt supports private lookup and CSRF-protected cancellation without login', async () => {
  const r = fixture('booking_blog')
  try {
    const s = await session(r), slot = r.booking.listSlots()[0]
    const created = await call(r, '/api/booking-requests', { ...s, method: 'POST', body: { serviceId: slot.serviceId, slotId: slot.id, name: 'Synthetic', email: 'fixture@example.invalid', phone: '0900000000', consent: true, idempotencyKey: 'guest-http-private' } })
    assert.equal(created.statusCode, 201); assert.equal(created.json.notification.configured, false)
    const path = `/api/booking-requests/${created.json.id}`
    assert.equal((await call(r, path)).statusCode, 404)
    const headers = { 'x-booking-token': created.json.accessToken }
    const detail = await call(r, path, { headers }); assert.equal(detail.statusCode, 200); assert.equal(detail.json.accessToken, undefined)
    assert.equal((await call(r, path, { method: 'PATCH', headers, body: { action: 'cancel', version: detail.json.version } })).statusCode, 403)
    const cancelled = await call(r, path, { ...s, method: 'PATCH', headers, body: { action: 'cancel', version: detail.json.version } })
    assert.equal(cancelled.json.status, 'cancelled'); assert.equal(r.booking.listSlots()[0].available, true)
    assert.equal((await call(r, '/booking')).statusCode, 200)
  } finally { r.close() }
})
test('real HTTP handler serves assets, checks host/origin/CSRF and hides admin data', async () => {
  const r = fixture()
  try {
    assert.equal((await call(r, '/assets/site.css')).headers['content-type'], 'text/css')
    assert.equal((await call(r, '/assets/site.js', { method: 'HEAD' })).data, '')
    assert.equal((await call(r, '/', { headers: { host: 'wrong.test' } })).statusCode, 421)
    assert.equal((await call(r, '/api/contact', { method: 'POST', body: {} })).statusCode, 403)
    const s = await session(r)
    assert.equal((await call(r, '/api/contact', { ...s, method: 'POST', headers: { origin: 'https://evil.test' }, body: {} })).statusCode, 403)
    assert.equal((await call(r, '/api/admin/orders', s)).statusCode, 401)
    assert.equal((await call(r, '/admin')).headers.location, '/admin/login')
    assert.equal((await call(r, '/not-a-page')).statusCode, 404)
    assert.equal((await call(r, '/products/missing-product')).statusCode, 404)
    assert.equal((await call(r, '/journal/missing-article')).statusCode, 404)
  } finally { r.close() }
})
test('checkout persists authoritative orders and admin transitions are permission-gated', async () => {
  const r = fixture()
  try {
    const s = await session(r); const product = r.commerce.listProducts()[0]
    const body = { items: [{ productId: product.id, quantity: 1, priceMinor: 1 }], customer: { name: '測試顧客', email: 'fixture@example.invalid', phone: '0912345678', address: '測試地址' }, consent: true, idempotencyKey: 'server-checkout-fixture' }
    const created = await call(r, '/api/orders', { ...s, method: 'POST', body }); assert.equal(created.statusCode, 201); assert.ok(created.json.totalMinor > 1); assert.equal(created.json.paymentStatus, 'pending'); assert.equal(r.notifications.status().configured, false)
    const login = await call(r, '/api/admin/login', { ...s, method: 'POST', body: { password: 'local-fixture-admin-password' } }); assert.equal(login.statusCode, 200)
    const a = { cookie: login.headers['set-cookie'].split(';')[0], csrf: login.json.csrfToken }
    assert.equal((await call(r, '/api/admin/orders', a)).json.orders.length, 1)
    assert.equal((await call(r, '/api/admin/products', { ...a, method: 'DELETE', body: {} })).statusCode, 404)
    assert.equal((await call(r, '/api/auth/password-reset/request', { ...s, method: 'POST', body: { email: 'fixture@example.invalid' } })).statusCode, 403) // rotated session cannot be reused
  } finally { r.close() }
})
test('booking HTTP API isolates two members and guest holds do not create paid claims', async () => {
  const r = fixture('booking_blog')
  try {
    const s = await session(r); const registered = await call(r, '/api/auth/register', { ...s, method: 'POST', body: { name: '會員一', email: 'member@example.invalid', password: 'member-fixture-password', consent: true } }); assert.equal(registered.statusCode, 201)
    const m = { cookie: registered.headers['set-cookie'].split(';')[0], csrf: registered.json.csrfToken }; const memberId = registered.json.actor.id
    r.booking.adjustCredits(memberId, { delta: 2, reason: '合成測試堂數', idempotencyKey: 'http-credits-test' })
    const slot = r.booking.listSlots()[0]
    const reserved = await call(r, '/api/bookings', { ...m, method: 'POST', body: { serviceId: slot.serviceId, slotId: slot.id, idempotencyKey: 'http-booking-test' } }); assert.equal(reserved.statusCode, 201)
    assert.equal((await call(r, '/api/account', m)).json.bookings.length, 1)
    assert.equal((await call(r, '/api/account', await session(r))).statusCode, 401)
    assert.equal((await call(r, '/api/auth/email/request', { ...m, method: 'POST', body: {} })).statusCode, 503)
    const secondSession = await session(r)
    const second = await call(r, '/api/auth/register', { ...secondSession, method: 'POST', body: { name: '會員二', email: 'second@example.invalid', password: 'another-fixture-password', consent: true } })
    const secondMember = { cookie: second.headers['set-cookie'].split(';')[0], csrf: second.json.csrfToken }
    assert.equal((await call(r, '/api/account', secondMember)).json.bookings.length, 0)
    assert.equal((await call(r, `/api/bookings/${reserved.json.id}`, { ...secondMember, method: 'PATCH', body: { action: 'cancel' } })).statusCode, 404)
    assert.equal((await call(r, '/api/account', m)).json.bookings[0].status, 'confirmed')
    const guestSession = await session(r); const guestSlot = r.booking.listSlots().find(value => value.available)
    const guest = { serviceId: guestSlot.serviceId, slotId: guestSlot.id, name: '合成訪客', email: 'guest@example.invalid', phone: '0912345678', idempotencyKey: 'http-guest-test' }
    assert.equal((await call(r, '/api/booking-requests', { ...guestSession, method: 'POST', body: guest })).statusCode, 422)
    const requested = await call(r, '/api/booking-requests', { ...guestSession, method: 'POST', body: { ...guest, consent: true } })
    assert.equal(requested.statusCode, 201)
    assert.equal(requested.json.status, 'pending_hold')
    assert.equal(r.booking.balance(memberId).balance, 1)
  } finally { r.close() }
})
test('commerce member history requires verified email and can never query another mailbox', async () => {
  const r = fixture()
  try {
    const s = await session(r); const registered = await call(r, '/api/auth/register', { ...s, method: 'POST', body: { name: '會員', email: 'member@example.invalid', password: 'member-fixture-password', consent: true } })
    const m = { cookie: registered.headers['set-cookie'].split(';')[0], csrf: registered.json.csrfToken }; const product = r.commerce.listProducts()[0]
    const own = r.commerce.createOrder({ items: [{ productId: product.id, quantity: 1 }], customer: { name: '合成會員', email: 'member@example.invalid', phone: '0912345678', address: '測試地址' }, consent: true, idempotencyKey: 'member-history-test' })
    r.commerce.createOrder({ items: [{ productId: product.id, quantity: 1 }], customer: { name: '別的會員', email: 'other@example.invalid', phone: '0912345678', address: '其他測試地址' }, consent: true, idempotencyKey: 'other-history-test' })
    assert.equal((await call(r, '/api/account', m)).json.orders.length, 0)
    const link = r.auth.requestVerification(registered.json.actor.id); r.auth.confirmVerification({ token: link.delivery.token })
    const result = await call(r, '/api/account?email=other@example.invalid', m); assert.equal(result.json.orders.length, 1); assert.equal(result.json.orders[0].id, own.id); assert.equal(result.json.emailVerificationRequired, false)
  } finally { r.close() }
})
