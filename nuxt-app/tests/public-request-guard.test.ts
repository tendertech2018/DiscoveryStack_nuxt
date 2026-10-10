import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestFingerprint, resetLeadRateLimitsForTests, storeLead } from '../server/utils/lead'
import { createProcessRequestBudget, directPeerRequestFingerprint } from '../server/utils/publicRequestGuard'
import { leadInputSchema } from '../server/utils/leadInput'

const database = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), insertedValues: vi.fn() }))
vi.mock('../server/database', () => ({ getDatabase: () => database }))

beforeEach(() => {
  vi.clearAllMocks()
  database.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
  database.insert.mockReturnValue({ values: database.insertedValues })
  database.insertedValues.mockResolvedValue([{ insertId: 1 }])
})

function event(options: { peer?: string; forwarded?: string; userAgent?: string } = {}) {
  return {
    context: {},
    node: {
      req: {
        headers: {
          'x-forwarded-for': options.forwarded,
          'user-agent': options.userAgent,
        },
        socket: { remoteAddress: options.peer || '203.0.113.10' },
      },
    },
  } as any
}

afterEach(() => {
  resetLeadRateLimitsForTests()
  vi.useRealTimers()
})

describe('public request guard', () => {
  it('keeps transport metadata independent of forwarding or User-Agent headers without treating it as visitor identity', () => {
    const metadata = (request: any) => directPeerRequestFingerprint(request, 'public-contact-v2')
    const first = metadata(event({ peer: '10.0.0.7', forwarded: '198.51.100.1', userAgent: 'agent-a' }))
    const rotated = metadata(event({ peer: '10.0.0.7', forwarded: '198.51.100.200', userAgent: 'agent-b' }))
    const otherPeer = metadata(event({ peer: '10.0.0.8', forwarded: '198.51.100.1', userAgent: 'agent-a' }))
    expect(rotated).toBe(first)
    expect(otherPeer).not.toBe(first)
    expect(directPeerRequestFingerprint(event({ peer: '10.0.0.7' }), 'site-analysis-v2')).not.toBe(first)
  })

  it('preserves the deployed legacy heuristic for unrelated managed-site consumers', () => {
    const fingerprint = requestFingerprint(event({ peer: '10.0.0.7', forwarded: '198.51.100.1', userAgent: 'agent-a' }))
    expect(fingerprint).toBe(createHash('sha256').update('198.51.100.1\nagent-a').digest('hex'))
  })

  it.each(['shared proxy', 'absent serverless peer'])('allows more than five leads through a %s but rotating headers cannot reset the 500-call budget', async (mode) => {
    const input = leadInputSchema.parse({ name: 'Synthetic Lead', email: 'synthetic@example.test', company: 'Synthetic', packageInterest: 'unsure', language: 'en', privacyConsent: true })
    const request = (index: number) => {
      const value = event({ peer: '10.0.0.9', forwarded: `198.51.100.${index % 250 + 1}`, userAgent: `rotating-agent-${index}` })
      if (mode === 'absent serverless peer') delete value.node.req.socket.remoteAddress
      return value
    }
    for (let index = 0; index < 500; index += 1) {
      await expect(storeLead(request(index), input)).resolves.toEqual({ received: true, duplicate: false })
    }
    await expect(storeLead(request(500), input)).rejects.toMatchObject({ statusCode: 429 })
    expect(database.select).toHaveBeenCalledTimes(500)
    expect(database.insertedValues).toHaveBeenCalledTimes(500)
    const fingerprints = database.insertedValues.mock.calls.map(([value]) => value.requestFingerprint)
    expect(new Set(fingerprints).size).toBe(1)
  })

  it('keeps one fixed budget, rejects without extending the window, and resets at expiry', () => {
    const budget = createProcessRequestBudget({ windowMs: 1_000, limit: 2, statusMessage: 'synthetic process budget' })
    budget.enforce(1)
    budget.enforce(2)
    for (let attempt = 0; attempt < 10_000; attempt += 1) expect(() => budget.enforce(999)).toThrow(/synthetic process budget/u)
    expect(() => budget.enforce(1_001)).not.toThrow()
    expect(() => budget.enforce(1_001)).not.toThrow()
    expect(() => budget.enforce(1_001)).toThrow(/synthetic process budget/u)
  })
})
