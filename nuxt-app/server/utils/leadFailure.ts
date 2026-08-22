import { createError } from 'h3'

type ErrorLike = { code?: string | number, errno?: string | number, statusCode?: number, statusMessage?: string }

export type LeadFailure = {
  statusCode: number
  code: 'LEAD_CAPTURE_SCHEMA_UNAVAILABLE' | 'LEAD_CAPTURE_UNAVAILABLE' | 'LEAD_CAPTURE_RATE_LIMITED' | 'LEAD_CAPTURE_WRITE_FAILED'
  requestId: string
}

const schemaErrorCodes = new Set(['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE', '1054', '1146'])

export function classifyLeadFailure(error: unknown, requestId: string): LeadFailure {
  const source = (error && typeof error === 'object' ? error : {}) as ErrorLike
  const databaseCode = String(source.code ?? source.errno ?? '')
  if (schemaErrorCodes.has(databaseCode)) return { statusCode: 503, code: 'LEAD_CAPTURE_SCHEMA_UNAVAILABLE', requestId }
  if (source.statusCode === 429) return { statusCode: 429, code: 'LEAD_CAPTURE_RATE_LIMITED', requestId }
  if (source.statusCode === 503) return { statusCode: 503, code: 'LEAD_CAPTURE_UNAVAILABLE', requestId }
  return { statusCode: 500, code: 'LEAD_CAPTURE_WRITE_FAILED', requestId }
}

export function leadFailureResponse(failure: LeadFailure) {
  return createError({
    statusCode: failure.statusCode,
    statusMessage: 'Lead capture could not be completed.',
    data: { code: failure.code, requestId: failure.requestId },
  })
}
