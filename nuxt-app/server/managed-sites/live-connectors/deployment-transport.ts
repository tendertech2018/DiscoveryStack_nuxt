import { createError } from 'h3'
import { isOpaqueReference } from '../../first-party-publishing/normalization'
import type { ManagedSiteCredentialResolver, ManagedSiteDeploymentAdapter, ManagedSiteDeploymentReceipt } from './types'
import { assertAllowedManagedSiteProviderOrigin } from './provider-verifiers'
import { readBoundedManagedSiteResponse } from './hmac-broker-transport'

const RECEIPT_KEYS = new Set(['providerKey', 'providerEventId', 'providerDeploymentId', 'projectId', 'versionId', 'contentHash', 'canonicalDomain', 'deploymentUrl', 'status', 'observedAt', 'payloadHash', 'providerAuthorityFingerprint', 'exactResponseIdentity'])

function boundedReceipt(value: unknown): ManagedSiteDeploymentReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== RECEIPT_KEYS.size || Object.keys(value).some(key => !RECEIPT_KEYS.has(key))) throw createError({ statusCode: 502, statusMessage: 'Deployment provider returned a malformed receipt.' })
  return value as ManagedSiteDeploymentReceipt
}

/** Authenticated bearer production boundary. This is intentionally not described as signed; response authority is strict identity/hash validation. */
export function createAuthenticatedBearerManagedSiteDeploymentAdapter(options: { endpointOrigin: string; providerKey: string; credentialReference: string; resolveCredential: ManagedSiteCredentialResolver; providerAuthorityFingerprint?: string; fetchImpl?: typeof fetch; allowedOrigins?: string }): ManagedSiteDeploymentAdapter {
  const origin = assertAllowedManagedSiteProviderOrigin(options.endpointOrigin, options.allowedOrigins)
  if (options.providerKey !== 'internal-deployment-bearer-v1' || !isOpaqueReference(options.credentialReference, 160)) throw createError({ statusCode: 503, statusMessage: 'Managed deployment transport configuration is invalid.' })
  const fetchImpl = options.fetchImpl || fetch
  const execute = async (operation: 'preview' | 'production' | 'rollback', payload: Record<string, unknown>, timeoutMs: number): Promise<ManagedSiteDeploymentReceipt> => {
    const authority = payload.providerAuthority as { authorityFingerprint?: unknown } | undefined
    if (options.providerAuthorityFingerprint && authority?.authorityFingerprint !== options.providerAuthorityFingerprint) throw createError({ statusCode: 409, statusMessage: 'Deployment provider configuration authority changed before transport execution.' })
    const credential = await options.resolveCredential(options.credentialReference)
    if (!credential.ok) throw createError({ statusCode: 503, statusMessage: 'Managed deployment credential reference could not be resolved.' })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    let text: string
    try {
      response = await fetchImpl(`${origin}/v1/managed-sites/${operation}`, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${credential.value}` }, body: JSON.stringify({ schemaVersion: 'discoverystack-managed-deployment-command-v1', providerKey: options.providerKey, operation, ...payload }) })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw Object.assign(new Error('deployment provider rejected command'), { code: response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'UPSTREAM_FAILURE' : 'PROVIDER_REJECTED', retryable: response.status === 429 || response.status >= 500 })
      }
      if (Number(response.headers.get('content-length')) > 64_000) {
        await response.body?.cancel().catch(() => undefined)
        throw createError({ statusCode: 502, statusMessage: 'Deployment provider receipt exceeded the fixed response limit.' })
      }
      text = await readBoundedManagedSiteResponse(response, 64_000)
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode || ['RATE_LIMITED', 'UPSTREAM_FAILURE', 'PROVIDER_REJECTED'].includes(String((error as { code?: string })?.code))) throw error
      throw Object.assign(new Error('deployment transport failed'), { code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_FAILURE', retryable: true })
    } finally { clearTimeout(timer) }
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { throw createError({ statusCode: 502, statusMessage: 'Deployment provider returned invalid JSON.' }) }
    const receipt = boundedReceipt(parsed)
    if (!Number.isFinite(Date.parse(receipt.observedAt)) || Math.abs(Date.now() - Date.parse(receipt.observedAt)) > 10 * 60_000 || !/^[a-f0-9]{64}$/u.test(receipt.payloadHash)) throw createError({ statusCode: 502, statusMessage: 'Deployment provider receipt timestamp or payload hash is invalid.' })
    return receipt
  }
  return {
    async buildPreview(input) { return execute('preview', input as unknown as Record<string, unknown>, input.timeoutMs) },
    async deployProduction(input) { return execute('production', input as unknown as Record<string, unknown>, input.timeoutMs) },
    async rollback(input) { return execute('rollback', input as unknown as Record<string, unknown>, input.timeoutMs) },
  }
}
