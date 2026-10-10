import { storeLead } from '../utils/lead'
import { leadInputSchema } from '../utils/leadInput'
import { PUBLIC_REQUEST_BODY_MAX_BYTES } from '../utils/publicRequestGuard'
import { readBoundedRequestBody } from '../utils/bounded-request-body'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const body = await readBoundedRequestBody(event, {
    maxBytes: PUBLIC_REQUEST_BODY_MAX_BYTES,
    oversizedMessage: 'Lead request body is too large.',
    invalidMessage: 'Please review the required fields.',
    invalidStatusCode: 422,
  })
  const parsed = leadInputSchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Please review the required fields.', data: parsed.error.flatten().fieldErrors })
  // Honeypot bots receive the same safe acknowledgement without persisting a record.
  if (parsed.data.companyFax) return { received: true, duplicate: false }
  return storeLead(event, parsed.data)
})
