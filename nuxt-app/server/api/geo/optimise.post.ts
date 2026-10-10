import { createError, defineEventHandler, setHeader } from 'h3'
import { optimiseGeoDocument } from '../../geo/optimise'
import type { GeoDocumentInput } from '../../geo/contracts'
import { BoundedQwenPreviewError, createBoundedQwenPreviewAdapter } from '../../geo/bounded-preview'
import { requireOwner } from '../../utils/auth'
import { readBoundedRequestBody } from '../../utils/bounded-request-body'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  await requireOwner(event)
  const body = await readBoundedRequestBody(event, {
    maxBytes: 64 * 1024,
    oversizedMessage: 'GEO request body is too large.',
    invalidMessage: 'Invalid GEO request.',
    invalidStatusCode: 400,
  }) as Record<string, unknown> | null
  if (!body || typeof body.title !== 'string' || typeof body.content !== 'string' || (body.language !== 'en' && body.language !== 'zh-hant')) {
    throw createError({ statusCode: 400, message: '請提供標題、原文與支援的語言。' })
  }
  if (body.mode !== undefined && body.mode !== 'bounded-qwen-preview') {
    throw createError({ statusCode: 400, message: '不支援的草稿模式。' })
  }
  const bounded = body.mode === 'bounded-qwen-preview'
  if (bounded && body.confirmedPublicContent !== true) {
    throw createError({ statusCode: 400, message: '請先確認只提供自家公開網站內容，並同意本次 AI 測試費用上限 US$1。' })
  }
  // V1 only computes an owner-reviewed draft and never writes the source to the database.
  // Never pass client provider options, evidence or cost settings into the trusted adapter.
  const input: GeoDocumentInput = { title: body.title, content: body.content, language: body.language }
  if (!bounded) return optimiseGeoDocument(input)
  try {
    return await optimiseGeoDocument(input, createBoundedQwenPreviewAdapter())
  } catch (error) {
    if (error instanceof BoundedQwenPreviewError) {
      const statusCode = ({ CONFIGURATION: 503, ALREADY_USED: 409, REQUEST_TOO_LARGE: 413, TIMEOUT: 504 } as Record<string, number>)[error.code] ?? 502
      throw createError({
        statusCode,
        message: '限額草稿測試未完成，系統未重試或改用其他 AI。若請求已送出，仍可能有費用；請先核對用量，不要直接重送。',
        data: { code: error.code, retryable: false },
      })
    }
    // Preserve safe input errors, but never echo an unexpected provider payload or credential.
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 400) throw error
    throw createError({ statusCode: 502, message: '限額草稿測試未完成。請先核對用量，不要直接重送。', data: { retryable: false } })
  }
})
