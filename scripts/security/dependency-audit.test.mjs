import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateAudit } from './dependency-audit.mjs'

const exception = { app: 'fixture', advisory: 'GHSA-fixture', module: 'build-only', version: '1.0.0', paths: ['.>builder>build-only'], expires: '2026-11-09' }
const options = { app: 'fixture', exceptions: [exception], now: new Date('2026-10-10T00:00:00Z') }
function report(overrides = {}) {
  return { metadata: { vulnerabilities: { high: 1 } }, advisories: { fixture: {
    github_advisory_id: 'GHSA-fixture', module_name: 'build-only', severity: 'high',
    findings: [{ version: '1.0.0', paths: ['.>builder>build-only'] }], ...overrides,
  } } }
}
test('accepts only a reviewed, exact, unexpired build dependency finding', () => {
  assert.equal(evaluateAudit(report(), options).ok, true)
})
test('a new advisory in the same package fails closed', () => {
  assert.equal(evaluateAudit(report({ github_advisory_id: 'GHSA-new' }), options).ok, false)
})
test('a runtime dependency path or changed version invalidates the exception', () => {
  for (const findings of [
    [{ version: '1.0.0', paths: ['.>runtime>build-only'] }],
    [{ version: '1.0.1', paths: ['.>builder>build-only'] }],
    [{ version: '1.0.0', paths: ['.>builder>build-only', '.>runtime>build-only'] }],
  ]) assert.equal(evaluateAudit(report({ findings }), options).ok, false)
})
test('expired exceptions and exceptions for another application do not pass', () => {
  assert.equal(evaluateAudit(report(), { ...options, now: new Date('2026-11-09T00:00:00Z') }).ok, false)
  assert.equal(evaluateAudit(report(), { ...options, app: 'public-site' }).ok, false)
})
test('registry errors and incomplete reports cannot become a clean audit', () => {
  assert.throws(() => evaluateAudit({ error: 'offline' }, options))
  assert.throws(() => evaluateAudit({ metadata: { vulnerabilities: { high: 1 } }, advisories: {} }, options))
  assert.throws(() => evaluateAudit({ metadata: { vulnerabilities: {} }, advisories: {} }, options))
  assert.throws(() => evaluateAudit(report({ findings: [] }), options))
})
test('an application with no vulnerabilities passes with no exceptions', () => {
  assert.equal(evaluateAudit({ metadata: { vulnerabilities: { high: 0 } }, advisories: {} }, { app: 'clean' }).ok, true)
})
