import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createMerchantSecrets } from '../lib/merchant-secrets.mjs'
import { createCommerce } from '../lib/commerce.mjs'
const fixture = { secretKey: 'sk_test_syntheticFixtureNotReal000', webhookSecret: 'whsec_syntheticFixtureNotReal000' }
test('test keys are encrypted, tenant-bound, write-only and cannot enable production', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const config = { siteId: 'secrets-fixture', mode: 'preview' }
    createCommerce(db, config)
    const vault = createMerchantSecrets(db, config, 'synthetic-stable-encryption-secret-0000000')
    assert.deepEqual(vault.save(fixture), { configured: true, mode: 'test', verified: false })
    const stored = db.prepare('SELECT * FROM merchant_secrets').get()
    assert.ok(!JSON.stringify(stored).includes(fixture.secretKey))
    assert.ok(!JSON.stringify(stored).includes(fixture.webhookSecret))
    assert.deepEqual(vault.read(), fixture)
    assert.throws(() => createMerchantSecrets(db, { ...config, siteId: 'another-site' }, 'synthetic-stable-encryption-secret-0000000').read())
    assert.throws(() => vault.save({ ...fixture, secretKey: fixture.secretKey.replace('test', 'live') }))
    assert.throws(() => vault.save({ ...fixture, enableLive: true }))
    assert.throws(() => createMerchantSecrets(db, { ...config, mode: 'production' }, 'synthetic-stable-encryption-secret-0000000').save(fixture))
    assert.throws(() => createMerchantSecrets(db, config, '').save(fixture))
  } finally { db.close() }
})
