import { classifyLeadFailure } from '../server/utils/leadFailure'
import { describe, expect, it } from 'vitest'

describe('lead capture failure contract', () => {
  it('maps missing Growth Ledger tables or columns to a safe migration-visible code', () => {
    expect(classifyLeadFailure({ code: 'ER_NO_SUCH_TABLE' }, 'req-1')).toEqual({
      statusCode: 503,
      code: 'LEAD_CAPTURE_SCHEMA_UNAVAILABLE',
      requestId: 'req-1',
    })
    expect(classifyLeadFailure({ errno: 1054 }, 'req-2').code).toBe('LEAD_CAPTURE_SCHEMA_UNAVAILABLE')
  })

  it('does not expose database error text in client-safe failure data', () => {
    const failure = classifyLeadFailure({ message: 'sensitive database implementation detail' }, 'req-3')
    expect(failure).toEqual({ statusCode: 500, code: 'LEAD_CAPTURE_WRITE_FAILED', requestId: 'req-3' })
  })
})
