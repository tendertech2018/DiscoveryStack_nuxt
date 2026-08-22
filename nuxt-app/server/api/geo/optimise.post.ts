import { createError, defineEventHandler, readBody } from 'h3'
import { optimiseGeoDocument } from '../../geo/optimise'
import { requireOwner } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const body = await readBody<{ title?: unknown, content?: unknown, language?: unknown }>(event)
  if (typeof body?.title !== 'string' || typeof body.content !== 'string' || (body.language !== 'en' && body.language !== 'zh-hant')) {
    throw createError({ statusCode: 400, message: '請提供標題、原文與支援的語言。' })
  }
  // Deliberately no database write: V1 processes an owner request in memory only.
  return optimiseGeoDocument({ title: body.title, content: body.content, language: body.language })
})
