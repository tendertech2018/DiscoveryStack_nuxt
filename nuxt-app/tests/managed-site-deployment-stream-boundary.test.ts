import { describe, expect, it, vi } from 'vitest'
import { createAuthenticatedBearerManagedSiteDeploymentAdapter } from '../server/managed-sites/live-connectors/deployment-transport'
import type { ManagedSiteDeploymentAdapter } from '../server/managed-sites/live-connectors/types'

const endpoint = 'https://deploy.acme.taipei'
const command = { projectId: 1, timeoutMs: 20 } as Parameters<ManagedSiteDeploymentAdapter['buildPreview']>[0]
const adapter = (fetchImpl: typeof fetch) => createAuthenticatedBearerManagedSiteDeploymentAdapter({ endpointOrigin: endpoint, allowedOrigins: endpoint, providerKey: 'internal-deployment-bearer-v1', credentialReference: 'envref:deployment-runtime', resolveCredential: async () => ({ ok: true, value: 'synthetic' }), fetchImpl })

describe('deployment receipt streaming boundary', () => {
  it('keeps the timeout active after headers while waiting for the receipt body', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => new Response(new ReadableStream({ start(controller) { init!.signal!.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true }) } }))) as typeof fetch
    await expect(adapter(fetchImpl).buildPreview(command)).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it.each([true, false])('cancels an oversized body (announced=%s) without parsing it', async announced => {
    const cancel = vi.fn()
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(64_001)) }, cancel }), { headers: announced ? { 'content-length': '64001' } : {} })) as typeof fetch
    await expect(adapter(fetchImpl).buildPreview(command)).rejects.toMatchObject({ statusCode: announced ? 502 : 409 })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  it('preserves provider rejection classification and never retries', async () => {
    const fetchImpl = vi.fn(async () => new Response('rejected', { status: 429 })) as typeof fetch
    await expect(adapter(fetchImpl).buildPreview(command)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
