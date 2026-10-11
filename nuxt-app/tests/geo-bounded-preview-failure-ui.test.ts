import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { boundedPreviewFailureMessage } from '../utils/boundedPreviewFailure'

const codes = ['CONFIGURATION', 'ALREADY_USED', 'REQUEST_TOO_LARGE', 'TIMEOUT', 'TRANSPORT', 'UNAUTHORIZED', 'RATE_LIMITED', 'UPSTREAM', 'RESPONSE_TOO_LARGE', 'MALFORMED_RESPONSE', 'MODEL_MISMATCH', 'TRUNCATED_RESPONSE', 'USAGE_INVALID', 'BUDGET_EXCEEDED', 'THINKING_NOT_DISABLED', 'UNSAFE_OUTPUT', 'UNKNOWN']
const secret = 'synthetic-secret-never-display'
const failure = (code: unknown) => ({ statusCode: 502, message: secret, data: { message: secret, stack: secret, data: { code, retryable: false, cause: secret } } })

describe('bounded preview safe failure UI', () => {
  it.each(codes)('explains only the allowlisted %s code from the HTTP envelope', code => {
    const message = boundedPreviewFailureMessage(failure(code))
    expect(message).toContain(`診斷代碼：${code}。`)
    expect(message).toContain('不能據此認定費用為零')
    expect(message).toContain('不要直接重送')
    expect(message).not.toContain(secret)
  })

  it.each([null, undefined, 'toString', '__proto__', secret, {}, [], 401])('does not reflect an unrecognized code %j', code => {
    const message = boundedPreviewFailureMessage(failure(code))
    expect(message).toContain('診斷代碼：UNKNOWN。')
    expect(message).not.toContain(secret)
  })

  it.each([null, undefined, secret, new Error(secret), { data: { code: 'TIMEOUT', retryable: false } }, { data: { data: { code: 'TIMEOUT', retryable: true } } }])('treats missing or malformed diagnostics as unknown', error => {
    expect(boundedPreviewFailureMessage(error)).toContain('診斷代碼：UNKNOWN。')
    expect(boundedPreviewFailureMessage(error)).not.toContain(secret)
  })

  it.each([{ status: 401 }, { statusCode: 401 }, { data: { statusCode: 401 } }])('keeps owner authentication failures distinct from provider authorization', error => {
    expect(boundedPreviewFailureMessage(error)).toContain('需要 owner 工作階段')
    expect(boundedPreviewFailureMessage(failure('UNAUTHORIZED'))).toContain('AI 供應商拒絕存取')
  })

  it('executes the actual page handler without retrying or exposing the raw error', async () => {
    const source = readFileSync(new URL('../pages/audit-lab/geo.vue', import.meta.url), 'utf8')
    const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/u)?.[1]
    expect(script).toBeTruthy()
    const javascript = ts.transpileModule(`${script}\nexport { runOptimization, errorMessage, state, boundedPreviewSent };`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const fetcher = vi.fn().mockRejectedValue(failure('USAGE_INVALID'))
    const module = { exports: {} as Record<string, any> }
    const sandbox = {
      module, exports: module.exports,
      require: (id: string) => {
        if (id === '../../utils/boundedPreviewFailure') return { boundedPreviewFailureMessage }
        throw new Error(`Unexpected runtime import: ${id}`)
      },
      reactive: (value: unknown) => value,
      // All false refs on this page are the public-content confirmation and the
      // submission latch. Set only the first to true to model explicit consent.
      ref: (() => { let falseRefs = 0; return (value: unknown) => ({ value: value === false && ++falseRefs === 1 ? true : value }) })(),
      computed: (read: () => unknown) => ({ get value() { return read() } }),
      definePageMeta: () => {}, useHead: () => {}, $fetch: fetcher,
    }
    runInNewContext(javascript, sandbox)
    await module.exports.runOptimization()
    expect(module.exports.state.value).toBe('error')
    expect(module.exports.errorMessage.value).toContain('診斷代碼：USAGE_INVALID。')
    expect(module.exports.errorMessage.value).not.toContain(secret)
    expect(module.exports.boundedPreviewSent.value).toBe(true)
    await module.exports.runOptimization()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ retry: 0, body: { mode: 'bounded-qwen-preview', confirmedPublicContent: true } })
  })
})
