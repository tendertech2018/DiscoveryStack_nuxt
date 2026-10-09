import type { H3Event } from 'h3'
import { getCachedRuntimeReadiness, livenessPayload, sanitizePublicReadiness } from './readiness'
import { resolveOperationsReleaseIdentity } from './release'

function eventRelease(event: H3Event) {
  const config = useRuntimeConfig(event) as { operationsBuildCommit?: unknown }
  return resolveOperationsReleaseIdentity(typeof config.operationsBuildCommit === 'string' ? config.operationsBuildCommit : '')
}

export function setPublicProbeHeaders(event: H3Event) {
  setResponseHeaders(event, {
    'cache-control': 'no-store, max-age=0',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  })
}

export function handleLiveness(event: H3Event) {
  setPublicProbeHeaders(event)
  return livenessPayload(eventRelease(event))
}

export async function handleReadiness(event: H3Event) {
  setPublicProbeHeaders(event)
  const readiness = await getCachedRuntimeReadiness({ release: eventRelease(event) })
  if (readiness.status !== 'ready') {
    setResponseStatus(event, 503)
    setHeader(event, 'Retry-After', 30)
  }
  return sanitizePublicReadiness(readiness)
}
