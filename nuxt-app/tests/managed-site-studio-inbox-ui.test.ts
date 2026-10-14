import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { journeyText } from '../utils/managedSiteJourneyCopy'

const source = readFileSync(new URL('../components/StudioInboxBinding.vue', import.meta.url), 'utf8')
function fixture() {
  const request = vi.fn(async () => ({} as any)), emit = vi.fn()
  const props = { request, email: 'customer@example.com', language: 'en', disabled: false, binding: { status: 'unbound', maskedEmail: null, resendAvailableAt: null, transportConfigured: true } }
  let unmount = () => {}
  const script = ts.transpileModule(`${source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/u)![1]}\nexport { binding, inbox, code, busy, waiting, canSend, sendCode, verifyCode, error };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', 'defineProps', 'defineEmits', script)((name: string) => name === 'vue' ? { ref: (value: unknown) => ({ value }), computed: (getter: () => unknown) => ({ get value() { return getter() } }), watch: () => {}, onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn } } : { journeyText }, module, module.exports, () => props, () => emit)
  return { page: module.exports, props, request, emit, unmount: () => unmount() }
}

describe('compact launch optional inbox verification — actual controller', () => {
  it('prefills known contact details but never sends a message automatically', () => {
    const f = fixture()
    expect(f.page.inbox.value).toBe('customer@example.com')
    expect(f.request).not.toHaveBeenCalled()
    expect(source).not.toMatch(/localStorage|sessionStorage|console\.|fetch\(/u)
  })
  it('requires an explicit send, respects cooldown, and only marks bound on a server confirmation', async () => {
    const f = fixture()
    f.request.mockResolvedValueOnce({ status: 'pending', maskedEmail: 'cu***@example.com', resendAvailableAt: new Date(Date.now() + 60_000).toISOString() })
    await f.page.sendCode()
    expect(f.request).toHaveBeenCalledWith('/inbox-binding', { method: 'POST', body: { email: 'customer@example.com' } })
    expect(f.page.binding.value.status).toBe('pending')
    expect(f.page.canSend.value).toBe(false)
    await f.page.sendCode(); expect(f.request).toHaveBeenCalledTimes(1)
    f.page.code.value = '12345'; await f.page.verifyCode(); expect(f.request).toHaveBeenCalledTimes(1)
    f.page.code.value = '123456'
    f.request.mockResolvedValueOnce({ status: 'bound', maskedEmail: 'cu***@example.com' }).mockResolvedValueOnce({ status: 'active', contactInbox: { status: 'bound' } })
    await f.page.verifyCode()
    expect(f.request).toHaveBeenNthCalledWith(2, '/inbox-binding-confirm', { method: 'POST', body: { code: '123456' } })
    expect(f.page.binding.value.status).toBe('bound'); expect(f.page.code.value).toBe('')
    expect(f.emit).toHaveBeenCalledWith('saved', { status: 'active', contactInbox: { status: 'bound' } })
  })
  it('does not send without configured mail delivery or duplicate an in-flight request', async () => {
    const f = fixture()
    f.page.binding.value.transportConfigured = false
    await f.page.sendCode(); expect(f.request).not.toHaveBeenCalled()
    f.page.binding.value.transportConfigured = true
    let finish!: (value: any) => void
    f.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = f.page.sendCode(); await f.page.sendCode()
    expect(f.request).toHaveBeenCalledTimes(1)
    f.unmount(); finish({ status: 'pending' }); await pending
    expect(f.page.binding.value.status).toBe('unbound'); expect(f.emit).not.toHaveBeenCalled()
  })
  it('keeps an unsuccessful verification pending and never leaks transport details', async () => {
    const f = fixture()
    f.page.binding.value.status = 'pending'; f.page.code.value = '123456'
    f.request.mockRejectedValueOnce(new Error('secret-provider-password'))
    await f.page.verifyCode()
    expect(f.page.binding.value.status).toBe('pending')
    expect(f.page.error.value).toContain('Verification did not complete')
    expect(f.page.error.value).not.toContain('secret-provider-password')
    expect(f.emit).not.toHaveBeenCalled()
  })
})
