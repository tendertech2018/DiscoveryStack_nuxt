import { describe, expect, it } from 'vitest'
import { AutoGeoBailianProviderError, createAutoGeoBailianQwenAdapter } from '../server/geo/autogeo-bailian-qwen'

const enabled = process.env.RUN_AUTOGEO_BAILIAN_LIVE_TEST === '1'

describe.runIf(enabled)('AutoGEO-framework × Bailian Qwen live acceptance', () => {
  it('returns a non-sensitive owner fixture rewrite with actual Bailian provenance', async () => {
    const adapter = createAutoGeoBailianQwenAdapter()
    let candidate
    try {
      candidate = await adapter.rewrite({
        title: '服務說明測試',
        language: 'zh-hant',
        content: '這是一段僅供 provider 連線驗證的非敏感測試文字。請產生一份清楚、可檢閱的草稿。',
      }, [])
    }
    catch (error) {
      if (error instanceof AutoGeoBailianProviderError) {
        throw new Error(`百煉 live acceptance 未成功：${error.issue}${error.httpStatus ? ` (HTTP ${error.httpStatus})` : ''}`)
      }
      throw error
    }

    expect(candidate.provider).toBe('autogeo-bailian-qwen')
    expect(candidate.provenance.execution).toBe('autogeo-framework-bailian-qwen')
    expect(candidate.provenance.model).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)
    expect(candidate.provenance.providerRequestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(candidate.optimizedContent.trim().length).toBeGreaterThan(0)
  }, 60_000)
})
