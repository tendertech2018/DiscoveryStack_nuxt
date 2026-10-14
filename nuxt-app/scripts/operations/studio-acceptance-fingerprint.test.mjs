import test from 'node:test'
import assert from 'node:assert/strict'
import { studioAcceptanceFingerprint as hash, studioAcceptanceLanguage as language } from './studio-acceptance-fingerprint.mjs'

test('database object-key reordering preserves the acceptance fingerprint', () => {
  assert.equal(hash({ brandName: 'QA', facts: { language: 'en', goal: 'sell_online' } }), hash({ facts: { goal: 'sell_online', language: 'en' }, brandName: 'QA' }))
})
test('actual values and ordered page content still change the fingerprint', () => {
  assert.notEqual(hash({ language: 'en' }), hash({ language: 'zh-Hant' }))
  assert.notEqual(hash({ pages: ['home', 'about'] }), hash({ pages: ['about', 'home'] }))
  assert.notEqual(hash({ value: null }), hash({ value: '' }))
})
test('BCP-47 case is equivalent while language and script changes remain visible', () => {
  assert.equal(language('zh-hant'), language('zh-Hant'))
  assert.equal(language('en-us'), language('en-US'))
  assert.notEqual(language('zh-Hant'), language('zh-Hans'))
  assert.notEqual(language('en'), language('ja'))
  assert.equal(language('invalid_language'), null)
})
