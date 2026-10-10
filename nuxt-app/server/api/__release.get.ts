import { resolveOperationsReleaseIdentity } from '../operations/release'

const OAUTH_NITRO_RELEASE = 'nitro-public-intelligence-20260818-r17-immutable-readiness-ssr'

function legacyReleaseContract() {
  return { release: OAUTH_NITRO_RELEASE, handler: 'nitro' }
}

export default defineEventHandler((event) => {
  // This endpoint is intentionally limited to non-sensitive deployment identity.
  // It differentiates the Nuxt/Nitro SSR container from stale or legacy handlers.
  setHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setHeader(event, 'X-DiscoveryStack-OAuth-Release', OAUTH_NITRO_RELEASE)
  setHeader(event, 'X-DiscoveryStack-Handler', 'nitro')
  const config = useRuntimeConfig(event) as { operationsBuildCommit?: unknown }
  const identity = resolveOperationsReleaseIdentity(typeof config.operationsBuildCommit === 'string' ? config.operationsBuildCommit : '')
  return { ...legacyReleaseContract(), commit: identity.commit }
})
