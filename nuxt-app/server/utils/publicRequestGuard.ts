import { createHash } from 'node:crypto'
import { createError, getRequestIP, type H3Event } from 'h3'

type Bucket = { count: number; startedAt: number }

type ProcessRequestBudgetOptions = {
  windowMs: number
  limit: number
  statusMessage: string
}

export const PUBLIC_REQUEST_BODY_MAX_BYTES = 16 * 1_024

/**
 * Coarse transport metadata only, not an authenticated visitor identity or a
 * public rate-limit key. Proxies can share a peer and serverless adapters can
 * omit it. Never trust forwarding or User-Agent headers to refine this value.
 */
export function directPeerRequestFingerprint(event: H3Event, namespace: string) {
  const peerAddress = getRequestIP(event) || 'unknown-peer'
  return createHash('sha256').update(`${namespace}\n${peerAddress}`).digest('hex')
}

/**
 * One fixed-size request budget per process, not a per-visitor limit. Render's
 * proxy peer and a serverless adapter's absent peer must not collapse visitors
 * into a small shared per-client allowance. No request-controlled identity or
 * header can create a fresh budget. A shared edge/store is still required for
 * enforcement across replicas; this state resets when the process restarts.
 */
export function createProcessRequestBudget(options: ProcessRequestBudgetOptions) {
  let bucket: Bucket | null = null

  return {
    enforce(now = Date.now()) {
      if (!bucket || now - bucket.startedAt >= options.windowMs) {
        bucket = { count: 0, startedAt: now }
      }
      if (bucket.count >= options.limit) throw createError({ statusCode: 429, statusMessage: options.statusMessage })
      bucket.count += 1
    },
    resetForTests() {
      bucket = null
    },
  }
}
