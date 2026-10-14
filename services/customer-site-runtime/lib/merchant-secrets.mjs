import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { fail } from './errors.mjs'

/** Write-only credentials. Stable server encryption is required, never sent to the browser. */
export function createMerchantSecrets(db, config, encryptionSecret) {
  db.exec('CREATE TABLE IF NOT EXISTS merchant_secrets (kind TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, updated_at TEXT NOT NULL)')
  const context = `customer-site:${config.siteId}:stripe-test-v1`
  function key() {
    if (typeof encryptionSecret !== 'string' || encryptionSecret.length < 32) fail(503, 'Stable server encryption key required', 'MERCHANT_ENCRYPTION_REQUIRED')
    return Buffer.from(hkdfSync('sha256', encryptionSecret, config.siteId, context, 32))
  }
  function read() {
    const row = db.prepare("SELECT ciphertext FROM merchant_secrets WHERE kind='stripe_test'").get()
    if (!row) return null
    try {
      const [nonce, tag, bytes] = row.ciphertext.split('.')
      const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(nonce, 'base64'))
      cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, 'base64'))
      return JSON.parse(Buffer.concat([cipher.update(Buffer.from(bytes, 'base64')), cipher.final()]).toString())
    } catch { fail(503, 'Stored merchant credentials are unavailable', 'MERCHANT_SECRET_UNAVAILABLE') }
  }
  function save(input) {
    if (config.mode !== 'preview') fail(409, 'Test keys cannot enable a production store', 'TEST_KEYS_PREVIEW_ONLY')
    if (!input || typeof input !== 'object' || Object.keys(input).sort().join(',') !== 'secretKey,webhookSecret' || !/^sk_test_[A-Za-z0-9]{8,240}$/u.test(input.secretKey || '') || !/^whsec_[A-Za-z0-9]{8,240}$/u.test(input.webhookSecret || '')) fail(422, 'Use a Stripe test secret key and this site’s webhook signing secret', 'STRIPE_TEST_KEYS_REQUIRED')
    if (db.prepare("SELECT 1 FROM commerce_orders WHERE payment_mode='stripe_test' AND payment_status='pending' AND fulfillment_status='unfulfilled' LIMIT 1").get()) fail(409, 'Resolve pending test payments before replacing credentials', 'PENDING_TEST_PAYMENTS')
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), nonce)
    cipher.setAAD(Buffer.from(context))
    const bytes = Buffer.concat([cipher.update(JSON.stringify({ secretKey: input.secretKey, webhookSecret: input.webhookSecret })), cipher.final()])
    const ciphertext = [nonce, cipher.getAuthTag(), bytes].map(x => x.toString('base64')).join('.')
    db.prepare("INSERT INTO merchant_secrets VALUES('stripe_test',?,?) ON CONFLICT(kind) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at").run(ciphertext, new Date().toISOString())
    return { configured: true, mode: 'test', verified: false }
  }
  return { read, save }
}
