import { storeLead } from '../utils/lead'
import { leadInputSchema } from '../utils/leadInput'
import { classifyLeadFailure, leadFailureResponse } from '../utils/leadFailure'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const parsed = leadInputSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Please review the required fields.', data: parsed.error.flatten().fieldErrors })
  // Honeypot bots receive the same safe acknowledgement without persisting a record.
  if (parsed.data.companyFax) return { received: true, duplicate: false }
  const requestId = crypto.randomUUID()
  try {
    return await storeLead(event, parsed.data)
  } catch (error) {
    const failure = classifyLeadFailure(error, requestId)
    console.error(JSON.stringify({ event: 'lead_capture_failed', code: failure.code, requestId: failure.requestId }))
    throw leadFailureResponse(failure)
  }
})
