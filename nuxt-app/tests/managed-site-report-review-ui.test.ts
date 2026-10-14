import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as language from '../utils/managedSiteLanguage'
import * as reportCopy from '../utils/managedSiteReportCopy'
import * as reportTypes from '../utils/managedSiteMonthlyReport'
import * as reviewCopy from '../utils/managedSitePageReview'
import { buildManagedSiteMonthlyReport } from '../server/managed-sites/monthly-report'

const reportSource = readFileSync(new URL('../pages/customer/managed-sites/report.vue', import.meta.url), 'utf8')
const reviewSource = readFileSync(new URL('../components/ManagedSitePageReview.vue', import.meta.url), 'utf8')
function fixture(source: string, exportNames: string, props?: any) {
  let unmount = () => {}, watcher = () => {}, mounted = () => {}
  const request = vi.fn(), print = vi.fn(), download = vi.fn()
  const script = ts.transpileModule(`${source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/u)![1]}\nexport { ${exportNames} };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  const require = (name: string) => name === 'vue' ? { ref: (value: unknown) => ({ value }), computed: (getter: () => unknown) => ({ get value() { return getter() } }), watch: (_: unknown, fn: () => void) => { watcher = fn }, onMounted: (fn: () => void) => { mounted = fn }, onBeforeUnmount: (fn: () => void) => { unmount = fn } } : name.includes('managedSiteReportCopy') ? reportCopy : name.includes('managedSiteMonthlyReport') ? reportTypes : name.includes('managedSitePageReview') ? reviewCopy : language
  new Function('require', 'module', 'exports', 'defineProps', '$fetch', 'useHead', 'window', 'document', 'navigator', script)(require, module, module.exports, () => ({ ...props, request }), request, () => {}, { print }, { createElement: () => ({ click: download }) }, { language: 'fr-FR' })
  return { page: module.exports, request, print, download, unmount: () => unmount(), changed: () => watcher(), mounted: () => mounted() }
}
const report = buildManagedSiteMonthlyReport({ brandName: 'Atelier', domain: 'atelier.acme.taipei', locale: 'fr', month: '2026-09', timeZone: 'Europe/Paris', now: new Date('2026-10-14'), evidence: { queries: [], observations: [] } })
describe('actual report and preflight interface controllers', () => {
  it('loads one month read-only and prevents exporting missing or stale data', async () => {
    const f = fixture(reportSource, 'report, month, locale, state, busy, load, download, printReport')
    f.page.printReport(); f.page.download(); expect(f.print).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled()
    f.request.mockResolvedValueOnce(report)
    await f.page.load()
    expect(f.request).toHaveBeenCalledWith('/api/managed-sites/customer/monthly-report', { query: {} })
    expect(f.page.locale.value).toBe('fr'); expect(f.page.month.value).toBe('2026-09')
    f.page.printReport(); expect(f.print).toHaveBeenCalledOnce()
    f.request.mockRejectedValueOnce(new Error('secret-query'))
    await f.page.load(); expect(f.page.report.value).toBeNull(); expect(f.page.state.value).toBe('error')
    f.page.printReport(); expect(f.print).toHaveBeenCalledOnce()
    expect(reportSource).not.toMatch(/localStorage|sessionStorage|console\./u)
  })
  it('ignores out-of-order and unmounted responses and distinguishes unconfigured data', async () => {
    const f = fixture(reportSource, 'report, month, state, busy, load')
    let finish!: (value: unknown) => void
    f.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ status: 'not_configured' })
    const earlier = f.page.load(); await f.page.load(); finish(report); await earlier
    expect(f.page.state.value).toBe('not_configured'); expect(f.page.report.value).toBeNull()
    f.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const current = f.page.load(); f.unmount(); finish(report); await current
    expect(f.page.report.value).toBeNull()
  })
  it('reviews only an explicit click, sends version identity but no document, and discards stale results', async () => {
    const f = fixture(reviewSource, 'report, busy, failed, review', { pageId: 'page_home_01', pageVersion: 3, locale: 'fr' })
    expect(f.request).not.toHaveBeenCalled()
    let finish!: (value: unknown) => void
    f.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const request = f.page.review(); await f.page.review()
    expect(f.request).toHaveBeenCalledOnce()
    expect(f.request).toHaveBeenCalledWith('/api/managed-sites/editor/pages/page_home_01/preflight', { method: 'POST', body: { expectedPageVersion: 3 } })
    f.changed(); finish({ pageId: 'page_home_01', pageVersion: 3 }); await request
    expect(f.page.report.value).toBeNull()
    f.request.mockResolvedValueOnce({ pageId: 'other_page', pageVersion: 3 }); await f.page.review()
    expect(f.page.failed.value).toBe(true); expect(f.page.report.value).toBeNull()
  })
  it.each(['en', 'zh-hant', 'zh-CN', 'ja', 'ko', 'fr-FR', 'de', 'es', 'pt-BR', 'ar', 'hi'])('provides complete review and report labels for %s', locale => {
    const copy = reviewCopy.managedSitePageReviewCopy(locale)
    expect(Object.values(copy)).toHaveLength(25)
    expect(Object.values(copy).every(value => typeof value === 'string' && value.length > 0)).toBe(true)
    expect(Object.values(reportCopy.managedSiteReportCopy(locale))).toHaveLength(35)
    if (locale === 'fr-FR') expect(copy.title).toContain('publication')
    if (locale === 'zh-CN') expect(copy.title).toContain('发布')
  })
})
