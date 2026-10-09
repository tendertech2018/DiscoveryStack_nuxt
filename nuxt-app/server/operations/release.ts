export const OPERATIONS_RELEASE_MARKER = 'nitro-public-intelligence-20260818-r17-immutable-readiness-ssr'

export type OperationsReleaseIdentity = {
  marker: string
  commit: string | null
}

function validCommit(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return /^[0-9a-f]{7,64}$/u.test(normalized) ? normalized : null
}

export function resolveOperationsReleaseIdentity(
  buildCommit = '',
  environment: Record<string, string | undefined> = process.env,
): OperationsReleaseIdentity {
  const commit = [
    environment.RENDER_GIT_COMMIT,
    environment.NUXT_OPERATIONS_BUILD_COMMIT,
    buildCommit,
    environment.DISCOVERYSTACK_BUILD_COMMIT,
    environment.SOURCE_VERSION,
    environment.GITHUB_SHA,
  ].map(validCommit).find(Boolean) || null
  return { marker: OPERATIONS_RELEASE_MARKER, commit }
}
