import { createError, getRouterParam } from 'h3'
import { assertEditorSameOrigin, readBoundedEditorBody, requireEditorActor, setEditorPrivateHeaders } from '../../../../../managed-sites/page-editor/http'
import { getDrizzlePageEditorRepository } from '../../../../../managed-sites/page-editor/repository-drizzle'
import { getDrizzleMediaVaultRepository } from '../../../../../managed-sites/media-vault/repository-drizzle'
import { reviewManagedPage } from '../../../../../managed-sites/page-editor/preflight'

export default defineEventHandler(async event => {
  setEditorPrivateHeaders(event)
  assertEditorSameOrigin(event)
  const { pageActor } = await requireEditorActor(event, 'content:read')
  const body = await readBoundedEditorBody(event, 2048)
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['expectedPageVersion', 'compareVersion'].includes(key))) throw createError({ statusCode: 422, statusMessage: 'Invalid page review request.' })
  const request = body as { expectedPageVersion: number; compareVersion?: number }
  if (!Number.isSafeInteger(request.expectedPageVersion) || request.expectedPageVersion < 1 || request.compareVersion !== undefined && (!Number.isSafeInteger(request.compareVersion) || request.compareVersion < 1)) throw createError({ statusCode: 422, statusMessage: 'Select valid page versions to compare.' })
  const media = getDrizzleMediaVaultRepository()
  try { return await reviewManagedPage({ repository: getDrizzlePageEditorRepository(), actor: pageActor, pageId: getRouterParam(event, 'pageId') || '', ...request, resolveMedia: (_actor, binding) => media.findAsset(pageActor, binding.assetId) }) }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && [403, 404, 409, 422].includes(Number(error.statusCode))) throw error
    throw createError({ statusCode: 503, statusMessage: 'Page review is temporarily unavailable.' })
  }
})
