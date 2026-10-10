import { createHash } from 'node:crypto'
import { createError, getRequestIP, type H3Event } from 'h3'

type Bucket = { count: number; startedAt: number }

type ProcessRateLimiterOptions = {
  windowMs: number
  peerLimit: number
  globalLimit: number
  maxBuckets: number
  statusMessage: string
}

export const PUBLIC_REQUEST_BODY_MAX_BYTES = 16 * 1_024

/**
 * Hash only the transport peer supplied by H3/Nitro. Forwarding and User-Agent
 * headers are client-controlled unless a separately verified edge trust policy
 * says otherwise, so they must not create fresh public rate-limit identities.
 */
export function directPeerRequestFingerprint(event: H3Event, namespace: string) {
  const peerAddress = getRequestIP(event) || 'unknown-peer'
  return createHash('sha256').update(`${namespace}\n${peerAddress}`).digest('hex')
}

/**
 * Per-process protection for small public endpoints. A shared edge/store remains
 * necessary for multi-replica global enforcement; this layer stays bounded and
 * fails closed instead of allowing distinct peers to grow memory without limit.
 */
export function createBoundedProcessRateLimiter(options: ProcessRateLimiterOptions) {
  const GLOBAL_BUCKET = 'global'
  const buckets = new Map<string, Bucket>()
  const pruneIntervalMs = Math.min(options.windowMs, 60_000)
  let nextPruneAt = 0

  const limited = (): never => {
    throw createError({ statusCode: 429, statusMessage: options.statusMessage })
  }

  const pruneExpired = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (now - bucket.startedAt >= options.windowMs) buckets.delete(key)
    }
    nextPruneAt = now + pruneIntervalMs
  }

  const consume = (key: string, now: number) => {
    const bucket = buckets.get(key)
    if (!bucket || now - bucket.startedAt >= options.windowMs) {
      buckets.set(key, { count: 1, startedAt: now })
      return
    }
    bucket.count += 1
  }

  const assertAvailable = (key: string, limit: number, now: number) => {
    const bucket = buckets.get(key)
    if (bucket && now - bucket.startedAt < options.windowMs && bucket.count >= limit) limited()
  }

  return {
    enforce(fingerprint: string, now = Date.now()) {
      const peerKey = `peer:${fingerprint || 'unknown-peer'}`
      if (now >= nextPruneAt) pruneExpired(now)

      const missingBuckets = Number(!buckets.has(GLOBAL_BUCKET)) + Number(!buckets.has(peerKey))
      if (buckets.size + missingBuckets > options.maxBuckets) {
        pruneExpired(now)
        const missingAfterPrune = Number(!buckets.has(GLOBAL_BUCKET)) + Number(!buckets.has(peerKey))
        if (buckets.size + missingAfterPrune > options.maxBuckets) limited()
      }

      // Check both buckets before mutating either. In particular, repeated calls
      // from a peer that is already blocked must not consume the shared quota and
      // turn one abusive client into a process-wide denial of service.
      assertAvailable(peerKey, options.peerLimit, now)
      assertAvailable(GLOBAL_BUCKET, options.globalLimit, now)
      consume(GLOBAL_BUCKET, now)
      consume(peerKey, now)
    },
    resetForTests() {
      buckets.clear()
      nextPruneAt = 0
    },
  }
}
