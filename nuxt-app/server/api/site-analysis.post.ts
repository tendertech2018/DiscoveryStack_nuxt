import { z } from 'zod'
import { analysePublicHomepage } from '../utils/publicSiteAnalysis'
import { createProcessRequestBudget, PUBLIC_REQUEST_BODY_MAX_BYTES } from '../utils/publicRequestGuard'
import { readBoundedRequestBody } from '../utils/bounded-request-body'

const inputSchema = z.object({ url: z.string().trim().url().max(2048) })
const WINDOW_MS = 60 * 60 * 1_000
const analysisRequestBudget = createProcessRequestBudget({
  windowMs: WINDOW_MS,
  limit: 800,
  statusMessage: 'Too many website checks. Please try again later.',
})

export function resetSiteAnalysisRateLimitsForTests() {
  analysisRequestBudget.resetForTests()
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const body = await readBoundedRequestBody(event, {
    maxBytes: PUBLIC_REQUEST_BODY_MAX_BYTES,
    oversizedMessage: 'Website check request body is too large.',
    invalidMessage: 'Enter a valid public website URL.',
    invalidStatusCode: 422,
  })
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Enter a valid public website URL.' })
  analysisRequestBudget.enforce()
  try {
    return await analysePublicHomepage(parsed.data.url)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'analysis_failed'
    const normalizedCode = code.toLowerCase()
    if (
      code === 'private_network_target'
      || normalizedCode.includes('private')
      || normalizedCode.includes('local network')
      || normalizedCode.includes('link-local')
      || normalizedCode.includes('public website')
      || normalizedCode.includes('public http')
    ) {
      throw createError({ statusCode: 422, statusMessage: 'Only public websites can be checked.' })
    }
    if (code === 'unsupported_content_type') throw createError({ statusCode: 422, statusMessage: 'That address did not return an HTML webpage.' })
    if (code === 'response_too_large') throw createError({ statusCode: 413, statusMessage: 'That homepage is too large for the free check.' })
    if (code === 'redirect_limit') throw createError({ statusCode: 422, statusMessage: 'That address redirects too many times.' })
    throw createError({ statusCode: 502, statusMessage: 'The public homepage could not be reached safely.' })
  }
})
