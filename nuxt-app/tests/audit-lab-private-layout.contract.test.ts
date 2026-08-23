import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = process.cwd()
const ownerLayout = readFileSync(join(appRoot, 'layouts/owner.vue'), 'utf8')
const privatePages = [
  'pages/audit-lab.vue',
  'pages/audit-lab/geo.vue',
  'pages/audit-lab/training-report.vue',
]

describe('Audit Lab private layout contract', () => {
  it('keeps all owner-only Audit Lab routes outside the public marketing layout', () => {
    for (const page of privatePages) {
      expect(readFileSync(join(appRoot, page), 'utf8')).toContain("layout: 'owner'")
    }
  })

  it('offers private navigation and a deliberate public-site exit without public marketing chrome', () => {
    expect(ownerLayout).toContain('id="owner-workbench"')
    expect(ownerLayout).toContain('aria-label="私有工作台導覽"')
    expect(ownerLayout).toContain('to="/audit-lab/geo"')
    expect(ownerLayout).toContain('to="/audit-lab/training-report"')
    expect(ownerLayout).toContain('to="/zh-hant"')
    expect(ownerLayout).not.toContain('CookieConsent')
    expect(ownerLayout).not.toContain('site-header')
    expect(ownerLayout).not.toContain('site-footer')
  })
})
