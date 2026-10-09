import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Compile the real SFC using Nuxt's installed Vue toolchain. A memory renderer
// exercises component state/events without adding a second DOM implementation.
const require = createRequire(import.meta.url)
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'))
const vue = nuxtRequire('vue')
const compiler = nuxtRequire('@vue/compiler-sfc')
const source = readFileSync(new URL('../pages/audit-lab/operations.vue', import.meta.url), 'utf8')
const parsed = compiler.parse(source)
const compiled = compiler.compileScript(parsed.descriptor, { id: 'operations-page-test', inlineTemplate: true })
const javascript = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText

type Node = { type: string; text: string; props: Record<string, any>; children: Node[]; parent: Node | null }
const node = (type: string, text = ''): Node => ({ type, text, props: {}, children: [], parent: null })
function all(root: Node): Node[] { return [root, ...root.children.flatMap(all)] }
function contents(root: Node): string { return all(root).map(item => item.text).join(' ') }

function mount(fetcher: ReturnType<typeof vi.fn>) {
  const runtime = { ...vue, vModelSelect: {} }
  const module = { exports: {} as { default?: any } }
  new Function('require', 'exports', 'module', 'ref', 'computed', 'onMounted', '$fetch', 'definePageMeta', 'useHead', javascript)(
    (name: string) => { if (name !== 'vue') throw new Error('Unexpected component import'); return runtime },
    module.exports, module, vue.ref, vue.computed, vue.onMounted, fetcher, vi.fn(), vi.fn(),
  )
  const renderer = vue.createRenderer({
    createElement: (type: string) => node(type),
    createText: (text: string) => node('#text', text),
    createComment: (text: string) => node('#comment', text),
    setText: (target: Node, text: string) => { target.text = text },
    setElementText: (target: Node, text: string) => { target.text = text; target.children = [] },
    parentNode: (target: Node) => target.parent,
    nextSibling: (target: Node) => target.parent?.children[target.parent.children.indexOf(target) + 1] || null,
    patchProp: (target: Node, key: string, _before: unknown, value: unknown) => { target.props[key] = value },
    remove: (target: Node) => { if (target.parent) target.parent.children.splice(target.parent.children.indexOf(target), 1); target.parent = null },
    insert: (target: Node, parent: Node, anchor: Node | null = null) => {
      if (target.parent) target.parent.children.splice(target.parent.children.indexOf(target), 1)
      target.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, target)
    },
  })
  const root = node('root')
  const app = renderer.createApp(module.exports.default)
  app.component('NuxtLink', { props: ['to'], setup: (props: any, context: any) => () => vue.h('a', { href: props.to }, context.slots.default?.()) })
  app.mount(root)
  return { root, app }
}

const report = () => ({
  status: 'not_ready', checkedAt: '2026-10-10T00:00:00.000Z',
  database: { status: 'ready', release: { commit: 'a'.repeat(40) }, database: { status: 'pass', reasonCode: null }, migrations: { status: 'exact', expectedCount: 58, observedCount: 58 } },
  scheduler: { status: 'awaiting_observation', processStartedAt: '2026-10-10T00:00:00.000Z', tasks: [
    { name: 'weekly-content:tick', cron: '*/5 * * * *', feature: { enabled: true }, status: 'healthy', heartbeat: null },
    { name: 'content-operations:measurement-tick', cron: '*/30 * * * *', feature: { enabled: true }, status: 'running_unproven', heartbeat: null },
    { name: 'learning-loop:tick', cron: '*/5 * * * *', feature: { enabled: false }, status: 'disabled', heartbeat: null },
  ] }, limitations: [],
})
const settle = async () => { await Promise.resolve(); await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }

describe('operations page component behavior', () => {
  it('renders runtime evidence, filters tasks, and clears old private evidence when refresh becomes unauthorized', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(report()).mockRejectedValueOnce({ statusCode: 401 })
    const { root, app } = mount(fetcher)
    try {
      await settle()
      expect(fetcher).toHaveBeenCalledWith('/api/operations/readiness')
      expect(contents(root)).toContain('與程式一致')
      expect(contents(root)).toContain('執行中，等待成功紀錄')
      const select = all(root).find(item => item.type === 'select')!
      select.props['onUpdate:modelValue']('attention')
      await settle()
      const table = all(root).find(item => item.type === 'table')!
      expect(contents(table)).toContain('搜尋與流量量測')
      expect(contents(table)).not.toContain('每週文章與 LINE')
      expect(contents(table)).not.toContain('資料學習與保留')
      select.props['onUpdate:modelValue']('enabled')
      await settle()
      expect(contents(table)).toContain('每週文章與 LINE')
      expect(contents(table)).not.toContain('資料學習與保留')
      all(root).find(item => item.type === 'button')!.props.onClick()
      await settle()
      expect(contents(root)).toContain('請先登入擁有人帳號')
      expect(contents(root)).not.toContain('a'.repeat(40))
      expect(all(root).some(item => item.type === 'table')).toBe(false)
    } finally { app.unmount() }
  })

  it('renders a recoverable generic failure without exposing an upstream error', async () => {
    const { root, app } = mount(vi.fn().mockRejectedValue(new Error('mysql://private-fixture')))
    try {
      await settle()
      expect(contents(root)).toContain('目前無法取得營運狀態')
      expect(contents(root)).not.toContain('mysql://')
      expect(all(root).find(item => item.props.role === 'alert')).toBeTruthy()
    } finally { app.unmount() }
  })
})
