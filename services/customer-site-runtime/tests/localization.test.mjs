import test from 'node:test'
import assert from 'node:assert/strict'
import { CURRENCIES, createTranslator, formatMoney } from '../public/locale.mjs'
import { parseConfig } from '../lib/config.mjs'
import { renderPage } from '../lib/render.mjs'
import { createSiteRuntime } from '../server.mjs'
import { notificationCopy } from '../lib/notification-copy.mjs'
const cfg = (locale = 'en', currency = 'USD') => parseConfig({ siteId: 'locale-test', siteType: 'commerce', brandName: '品牌故事', mode: 'preview', locale, currency })
test('charge units distinguish zero-decimal currencies from TWD charges; no FX conversion', () => {
  assert.equal(CURRENCIES.TWD, 2)
  assert.match(formatMoney(12345, 'USD', 'en'), /123\.45/)
  assert.match(formatMoney(12345, 'JPY', 'en'), /12,345/)
  assert.match(formatMoney(12345, 'TWD', 'en'), /123\.45/)
  assert.throws(() => formatMoney(1, 'XXX', 'en'))
  assert.throws(() => formatMoney(1.1, 'USD', 'en'))
  assert.throws(() => cfg('invalid_locale'))
})
test('localized literal templates never translate interpolated brand/customer text', () => {
  const t = createTranslator('en')
  assert.equal(t`<b>品牌故事</b><p>${'品牌故事'}</p>`, '<b>Our story</b><p>品牌故事</p>')
  for (const [locale, label] of [['en', 'Place order'], ['ja', '注文を送信'], ['fr', 'Passer la commande'], ['es', 'Enviar pedido'], ['ar', 'إرسال الطلب']]) {
    const html = renderPage({ config: cfg(locale), path: '/checkout' })
    assert.ok(html.includes(label), locale)
    assert.ok(html.includes('品牌故事'), 'approved brand name retained')
    assert.ok(html.includes(`lang="${locale}"`))
    assert.ok(html.includes('data-currency="USD"'))
    assert.ok(html.includes('type="module"'))
    if (locale === 'ar') assert.ok(html.includes('dir="rtl"'))
  }
})
test('runtime stores currency as immutable database authority', () => {
  const runtime = createSiteRuntime({ config: cfg('en', 'JPY'), origin: 'http://localhost:3002' })
  try {
    assert.equal(runtime.commerce.settings.currency, 'JPY')
    assert.equal(runtime.db.prepare('SELECT currency FROM commerce_currency').get().currency, 'JPY')
    assert.throws(() => parseConfig({ ...cfg(), currency: 'USD<script>' }))
  } finally { runtime.close() }
})
test('transactional notifications and order tracking follow the site language', () => {
  for (const locale of ['en', 'fr', 'es', 'ar']) {
    const copy = notificationCopy(locale)
    assert.doesNotMatch(Object.values(copy).join(' '), /[\u3400-\u9fff]/u)
    assert.doesNotMatch(createTranslator(locale)('訂單已建立，等待付款確認'), /[\u3400-\u9fff]/u)
  }
  assert.match(notificationCopy('ja').booking, /予約/)
})
