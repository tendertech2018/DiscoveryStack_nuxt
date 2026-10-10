import { afterEach, describe, expect, it, vi } from 'vitest'
import { enforceLeadRateLimit, requestFingerprint, resetLeadRateLimitsForTests } from '../server/utils/lead'
import { createBoundedProcessRateLimiter, directPeerRequestFingerprint } from '../server/utils/publicRequestGuard'

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
  it('uses only the direct transport peer, not forwarding or User-Agent headers', () => {
    const first = requestFingerprint(event({ peer: '10.0.0.7', forwarded: '198.51.100.1', userAgent: 'agent-a' }))
    const rotated = requestFingerprint(event({ peer: '10.0.0.7', forwarded: '198.51.100.200', userAgent: 'agent-b' }))
    const otherPeer = requestFingerprint(event({ peer: '10.0.0.8', forwarded: '198.51.100.1', userAgent: 'agent-a' }))
    expect(rotated).toBe(first)
    expect(otherPeer).not.toBe(first)
    expect(directPeerRequestFingerprint(event({ peer: '10.0.0.7' }), 'site-analysis-v2')).not.toBe(first)
  })

  it('does not let header rotation bypass the lead peer limit', () => {
    const fingerprints = Array.from({ length: 6 }, (_, index) => requestFingerprint(event({
      peer: '10.0.0.9',
      forwarded: `198.51.100.${index + 1}`,
      userAgent: `rotating-agent-${index}`,
    })))
    expect(new Set(fingerprints).size).toBe(1)
    for (const fingerprint of fingerprints.slice(0, 5)) enforceLeadRateLimit(fingerprint)
    expect(() => enforceLeadRateLimit(fingerprints[5]!)).toThrow(/Too many submissions/u)
  })

  it('enforces a process-wide cap across distinct peers', () => {
    const limiter = createBoundedProcessRateLimiter({ windowMs: 60_000, peerLimit: 10, globalLimit: 2, maxBuckets: 10, statusMessage: 'synthetic public limit' })
    limiter.enforce('peer-a', 1)
    limiter.enforce('peer-b', 1)
    expect(() => limiter.enforce('peer-c', 1)).toThrow(/synthetic public limit/u)
  })

  it('does not let a peer that is already denied drain the shared quota', () => {
    const limiter = createBoundedProcessRateLimiter({ windowMs: 60_000, peerLimit: 1, globalLimit: 3, maxBuckets: 10, statusMessage: 'synthetic fair limit' })
    limiter.enforce('peer-a', 1)
    for (let attempt = 0; attempt < 10; attempt += 1) expect(() => limiter.enforce('peer-a', 1)).toThrow(/synthetic fair limit/u)
    expect(() => limiter.enforce('peer-b', 1)).not.toThrow()
    expect(() => limiter.enforce('peer-c', 1)).not.toThrow()
    expect(() => limiter.enforce('peer-d', 1)).toThrow(/synthetic fair limit/u)
  })

  it('bounds bucket memory, fails closed while full, and prunes expired peers', () => {
    const limiter = createBoundedProcessRateLimiter({ windowMs: 1_000, peerLimit: 10, globalLimit: 100, maxBuckets: 3, statusMessage: 'synthetic bucket cap' })
    limiter.enforce('peer-a', 1)
    limiter.enforce('peer-b', 1)
    expect(() => limiter.enforce('peer-c', 1)).toThrow(/synthetic bucket cap/u)
    expect(() => limiter.enforce('peer-c', 1_002)).not.toThrow()
  })
})
