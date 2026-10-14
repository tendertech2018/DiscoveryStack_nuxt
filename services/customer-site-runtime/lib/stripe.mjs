import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { transaction } from './store.mjs'
import { restoreOrderInventory } from './commerce.mjs'
import { fail } from './errors.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const reject = () => fail(400, '付款通知驗證失敗', 'PAYMENT_EVENT_REJECTED')
const unavailable = () => fail(503, '線上付款暫時無法使用；請保留訂單並稍後重試。', 'PAYMENT_PROVIDER_UNAVAILABLE')
const providerId = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_]{3,200}$`, 'u').test(value)

/** Raw bytes only; timestamp tolerance is checked even for already-seen event IDs. */
export function verifyStripeEvent(raw, signature, secret, now = Date.now()) {
  if (!Buffer.isBuffer(raw) || raw.length > 256_000 || typeof signature !== 'string' || signature.length > 2048 || !/^whsec_[A-Za-z0-9]{8,240}$/u.test(secret || '')) reject()
  const fields = signature.split(',').map(part => part.trim().split('='))
  const timestamps = fields.filter(([key]) => key === 't')
  if (timestamps.length !== 1 || !/^\d{10,12}$/u.test(timestamps[0][1] || '')) reject()
  const timestamp = Number(timestamps[0][1])
  if (Math.abs(Math.floor(now / 1000) - timestamp) > 300) reject()
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest()
  if (!fields.some(([key, value]) => key === 'v1' && /^[a-f0-9]{64}$/u.test(value || '') && timingSafeEqual(expected, Buffer.from(value, 'hex')))) reject()
  try { const event = JSON.parse(raw.toString('utf8')); if (!providerId(event.id, 'evt') || typeof event.type !== 'string' || !event.data?.object || typeof event.livemode !== 'boolean') reject(); return event } catch { reject() }
}

async function boundedJson(response) {
  if (!response.ok || response.redirected || Number(response.headers.get('content-length') || 0) > 256_000) { await response.body?.cancel(); unavailable() }
  const reader = response.body?.getReader(); if (!reader) unavailable()
  let length = 0; const chunks = []
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 256_000) { await reader.cancel(); unavailable() }; chunks.push(value) }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch { unavailable() } finally { reader.releaseLock() }
}

/** Dedicated merchant credentials, never DiscoveryStack's subscription payment account. */
export function createStripePayments(db, commerce, config, { secretKey = '', webhookSecret = '', origin, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const mode = config.commerce.paymentMode
  const enabled = ['stripe_test', 'stripe_live'].includes(mode)
  const live = mode === 'stripe_live'
  const configured = enabled && new RegExp(`^sk_${live ? 'live' : 'test'}_[A-Za-z0-9]{8,240}$`, 'u').test(secretKey) && /^whsec_[A-Za-z0-9]{8,240}$/u.test(webhookSecret)
  const canonical = new URL(origin)
  if (canonical.origin !== origin || !['http:', 'https:'].includes(canonical.protocol) || live && canonical.protocol !== 'https:') fail(503, '付款返回網址設定不正確')
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_checkouts (
    order_id TEXT PRIMARY KEY REFERENCES commerce_orders(id), attempt_id TEXT NOT NULL UNIQUE,
    session_id TEXT UNIQUE, checkout_url TEXT, payment_intent TEXT UNIQUE,
    request_hash TEXT NOT NULL, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL,
    livemode INTEGER NOT NULL, created_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS stripe_events (
    event_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, event_type TEXT NOT NULL, received_at TEXT NOT NULL
  );`)
  const assertReady = () => { if (!configured) unavailable() }
  const eventLog = (orderId, kind, label) => db.prepare('INSERT INTO commerce_order_events VALUES(?,?,?,?,?,?)').run(randomUUID(), orderId, kind, label, '{}', new Date(now()).toISOString())

  async function checkout(orderId, accessToken) {
    assertReady()
    const order = commerce.getOrder(orderId, accessToken)
    if (order.paymentMode !== mode || order.paymentStatus !== 'pending' || order.fulfillmentStatus !== 'unfulfilled') fail(409, '這筆訂單目前不可重新付款', 'PAYMENT_STATE_CONFLICT')
    const requestHash = hash(JSON.stringify([config.siteId, order.id, order.totalMinor, order.currency, mode]))
    const attempt = transaction(db, () => {
      const previous = db.prepare('SELECT * FROM stripe_checkouts WHERE order_id=?').get(order.id)
      if (previous) { if (previous.request_hash !== requestHash) fail(409, '付款內容已改變，請聯絡商家'); return previous }
      if (Date.parse(order.expiresAt) - now() < 31 * 60_000) fail(409, '訂單保留時間不足，請重新建立訂單', 'PAYMENT_HOLD_TOO_SHORT')
      db.prepare('INSERT INTO stripe_checkouts(order_id,attempt_id,request_hash,amount_minor,currency,livemode,created_at) VALUES(?,?,?,?,?,?,?)').run(order.id, randomUUID(), requestHash, order.totalMinor, order.currency.toLowerCase(), Number(live), new Date(now()).toISOString())
      return db.prepare('SELECT * FROM stripe_checkouts WHERE order_id=?').get(order.id)
    })
    if (attempt.checkout_url) return { url: attempt.checkout_url, mode: live ? 'live' : 'test' }
    const form = new URLSearchParams({ mode: 'payment', 'payment_method_types[0]': 'card', client_reference_id: order.id,
      success_url: `${origin}/orders?payment=returned`, cancel_url: `${origin}/orders?payment=cancelled`,
      expires_at: String(Math.floor(Date.parse(order.expiresAt) / 1000) - 30),
      'metadata[siteId]': config.siteId, 'metadata[attemptId]': attempt.attempt_id,
      'line_items[0][price_data][currency]': attempt.currency,
      'line_items[0][price_data][unit_amount]': String(order.totalMinor),
      'line_items[0][price_data][product_data][name]': `${config.brandName} · ${order.number}`, 'line_items[0][quantity]': '1' })
    let result
    try {
      result = await boundedJson(await fetchImpl('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': `ds-site-${attempt.attempt_id}` }, body: form.toString() }))
    } catch { unavailable() }
    let target
    try { target = new URL(result.url) } catch { unavailable() }
    if (target.origin !== 'https://checkout.stripe.com' || target.username || target.password || !providerId(result.id, 'cs') || result.object !== 'checkout.session' || result.client_reference_id !== order.id || result.amount_total !== attempt.amount_minor || result.currency !== attempt.currency || result.livemode !== live || result.metadata?.siteId !== config.siteId || result.metadata?.attemptId !== attempt.attempt_id || result.mode !== 'payment') unavailable()
    transaction(db, () => {
      const prior = db.prepare('SELECT session_id FROM stripe_checkouts WHERE order_id=?').get(order.id)
      if (prior.session_id && prior.session_id !== result.id) fail(409, '付款識別不一致，已停止操作')
      db.prepare('UPDATE stripe_checkouts SET session_id=?,checkout_url=? WHERE order_id=?').run(result.id, target.toString(), order.id)
    })
    return { url: target.toString(), mode: live ? 'live' : 'test' }
  }

  function webhook(raw, signature) {
    assertReady()
    const event = verifyStripeEvent(raw, signature, webhookSecret, now())
    if (event.livemode !== live) reject()
    const supported = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'charge.refunded']
    if (!supported.includes(event.type)) return { received: true, ignored: true }
    return transaction(db, () => {
      const fingerprint = hash(raw), prior = db.prepare('SELECT payload_hash FROM stripe_events WHERE event_id=?').get(event.id)
      if (prior) { if (prior.payload_hash !== fingerprint) reject(); return { received: true, replayed: true } }
      const object = event.data.object
      if (event.type === 'charge.refunded') {
        if (object.object !== 'charge' || !providerId(object.id, 'ch') || !providerId(object.payment_intent, 'pi') || object.livemode !== live) reject()
        const attempt = db.prepare('SELECT * FROM stripe_checkouts WHERE payment_intent=?').get(object.payment_intent)
        if (!attempt) fail(409, '付款尚未完成對帳，請稍後重送通知', 'PAYMENT_RECONCILIATION_PENDING')
        const order = db.prepare('SELECT * FROM commerce_orders WHERE id=?').get(attempt.order_id)
        if (object.currency !== attempt.currency || object.amount !== attempt.amount_minor || !Number.isSafeInteger(object.amount_refunded) || object.amount_refunded < 0 || object.amount_refunded > attempt.amount_minor) reject()
        if (object.refunded === true && object.amount_refunded === attempt.amount_minor && order.payment_status !== 'refunded') {
          const restore = !order.inventory_released && !['shipped', 'delivered'].includes(order.fulfillment_status)
          db.prepare("UPDATE commerce_orders SET payment_status='refunded',fulfillment_status=CASE WHEN fulfillment_status IN ('shipped','delivered') THEN fulfillment_status ELSE 'cancelled' END,refund_kind='stripe_verified',refund_reference=?,inventory_released=?,updated_at=? WHERE id=?").run(object.id, restore ? 1 : order.inventory_released, new Date(now()).toISOString(), order.id)
          if (restore) restoreOrderInventory(db, order.id, new Date(now()).toISOString())
          eventLog(order.id, 'stripe_refund_confirmed', '金流已確認全額退款')
        } else if (object.amount_refunded > 0 && order.payment_status !== 'refunded') {
          db.prepare("UPDATE commerce_orders SET payment_status='review_required',updated_at=? WHERE id=?").run(new Date(now()).toISOString(), order.id)
          eventLog(order.id, 'stripe_partial_refund_review', '金流部分退款，暫停自動出貨，請商家對帳')
        }
      } else {
        const attempt = db.prepare('SELECT * FROM stripe_checkouts WHERE attempt_id=?').get(String(object.metadata?.attemptId || ''))
        if (!attempt || object.object !== 'checkout.session' || !providerId(object.id, 'cs') || object.metadata?.siteId !== config.siteId || object.client_reference_id !== attempt.order_id || object.livemode !== live || object.mode !== 'payment' || object.amount_total !== attempt.amount_minor || object.currency !== attempt.currency || attempt.session_id && attempt.session_id !== object.id) reject()
        const order = db.prepare('SELECT * FROM commerce_orders WHERE id=?').get(attempt.order_id)
        if (order.payment_mode !== mode) reject()
        db.prepare('UPDATE stripe_checkouts SET session_id=? WHERE order_id=?').run(object.id, order.id)
        if (event.type === 'checkout.session.expired') {
          if (object.status !== 'expired') reject()
          if (order.payment_status === 'pending' && !order.inventory_released) {
            db.prepare("UPDATE commerce_orders SET fulfillment_status='cancelled',inventory_released=1,updated_at=? WHERE id=?").run(new Date(now()).toISOString(), order.id)
            restoreOrderInventory(db, order.id, new Date(now()).toISOString())
          }
        } else if (object.payment_status === 'paid') {
          if (!providerId(object.payment_intent, 'pi') || attempt.payment_intent && attempt.payment_intent !== object.payment_intent) reject()
          db.prepare('UPDATE stripe_checkouts SET payment_intent=? WHERE order_id=?').run(object.payment_intent, order.id)
          if (order.payment_status === 'pending') {
            const review = order.inventory_released || order.fulfillment_status === 'cancelled'
            db.prepare('UPDATE commerce_orders SET payment_status=?,fulfillment_status=?,paid_at=?,updated_at=? WHERE id=?').run(review ? 'review_required' : 'paid', review ? order.fulfillment_status : 'processing', new Date(now()).toISOString(), new Date(now()).toISOString(), order.id)
            eventLog(order.id, review ? 'stripe_late_payment_review' : 'stripe_payment_confirmed', review ? '款項已到達，但訂單已釋出庫存，須人工對帳或退款' : live ? 'Stripe 已確認付款' : 'Stripe 測試付款已確認（非真實收款）')
          }
        }
      }
      db.prepare('INSERT INTO stripe_events VALUES(?,?,?,?)').run(event.id, fingerprint, event.type, new Date(now()).toISOString())
      return { received: true }
    })
  }
  return { configured, checkout, webhook, assertReady, status: () => ({ configured, provider: enabled ? 'stripe' : null, mode: enabled ? live ? 'live' : 'test' : 'disabled' }) }
}
