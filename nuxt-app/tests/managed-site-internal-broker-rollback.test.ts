import { describe, expect, it, vi } from 'vitest'
import { stableFingerprint } from '../server/seo-geo-core/repository'
import { rollbackCloudflarePagesProduction } from '../server/managed-sites/live-connectors/internal-broker/cloudflare-pages'
import { resolveManagedSiteRollbackAuthority } from '../server/managed-sites/live-connectors/internal-broker/rollback-authority'
import { createManagedSiteInternalBrokerFetch } from '../server/managed-sites/live-connectors/internal-broker/broker-fetch'
import { MANAGED_SITE_INTERNAL_BROKER_ORIGIN } from '../server/managed-sites/live-connectors/internal-broker/constants'
import { managedSiteProviderAuthorityMetadata, resolveManagedSiteProviderAuthority } from '../server/managed-sites/live-connectors/provider-registry'
import type { ManagedSiteRepository } from '../server/managed-sites/types'
import type { ManagedSiteLiveConnectorRepository } from '../server/managed-sites/live-connectors/types'

const hash = 'a'.repeat(64)
const input = { ownerUserId: 1, projectId: 2, toReleaseId: 3, canonicalDomain: 'live.acme.taipei', sourceDeploymentId: 'cf-new-001', targetDeploymentId: 'cf-old-001', targetRequestFingerprint: hash, timeoutMs: 30_000 }
function provider() {
  const target = { id: input.targetDeploymentId, project_id: 'project-001', project_name: 'ds-o1-p2', environment: 'production', url: 'https://deadbeef.ds-o1-p2.pages.dev/', deployment_trigger: { metadata: { branch: 'main', commit_message: `discoverystack-production:r3:${hash}` } }, latest_stage: { name: 'deploy', status: 'success' } }
  const project = { id: 'project-001', name: 'ds-o1-p2', production_branch: 'main', canonical_deployment: { ...target, id: input.sourceDeploymentId } }
  const domain = { name: input.canonicalDomain, status: 'active', validation_data: { status: 'active' }, verification_data: { status: 'active' } }
  const calls: Array<{ path: string; method: string }> = []
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const parsed = new URL(String(url)), path = parsed.pathname
    expect(parsed.origin).toBe('https://api.cloudflare.com')
    expect(path).toContain(`/accounts/${'b'.repeat(32)}/pages/projects/ds-o1-p2`)
    expect(init.redirect).toBe('error')
    calls.push({ path, method: init.method || 'GET' })
    let result: unknown
    if (path.endsWith('/rollback') && init.method === 'POST') { project.canonical_deployment = { ...target }; result = target }
    else if (path.endsWith('/cf-old-001')) result = target
    else if (path.endsWith(`/domains/${input.canonicalDomain}`)) result = domain
    else if (path.endsWith('/ds-o1-p2')) result = project
    else throw Error('Unexpected provider request')
    return new Response(JSON.stringify({ success: true, result }), { status: 200 })
  }) as typeof fetch
  const productionProbe = vi.fn(async (_host: string, _timeoutMs: number) => ({ status: 200, contentType: 'text/html', body: '<html>Verified historical homepage</html>' }))
  const beforeMutation = vi.fn(async () => {})
  const options = { fetchImpl, productionProbe, beforeMutation, accountId: 'b'.repeat(32), apiToken: 'synthetic', projectPrefix: 'ds' }
  return { target, project, domain, calls, options, run: () => rollbackCloudflarePagesProduction(input, options) }
}

describe('Cloudflare rollback driver', () => {
  it('restores the exact verified target and reconciles replay without a second mutation', async () => {
    const f = provider()
    await expect(f.run()).resolves.toMatchObject({ deploymentId: input.targetDeploymentId, deploymentUrl: `https://${input.canonicalDomain}/` })
    await expect(f.run()).resolves.toMatchObject({ deploymentId: input.targetDeploymentId })
    expect(f.calls.filter(call => call.method !== 'GET')).toEqual([{ path: expect.stringContaining('/cf-old-001/rollback'), method: 'POST' }])
    expect(f.options.productionProbe).toHaveBeenCalledWith('deadbeef.ds-o1-p2.pages.dev', expect.any(Number))
    expect(f.options.productionProbe).toHaveBeenCalledWith(input.canonicalDomain, expect.any(Number))
  })
  it.each(['project', 'preview', 'marker', 'domain', 'pointer', 'failed', 'mutableUrl'] as const)('refuses %s mismatch before mutation', async change => {
    const f = provider()
    if (change === 'project') f.target.project_name = 'another-project'
    if (change === 'preview') f.target.environment = 'preview'
    if (change === 'marker') f.target.deployment_trigger.metadata.commit_message = 'another-release'
    if (change === 'domain') f.domain.status = 'pending'
    if (change === 'pointer') f.project.canonical_deployment.id = 'another-live-version'
    if (change === 'failed') f.target.latest_stage.status = 'failure'
    if (change === 'mutableUrl') f.target.url = 'https://ds-o1-p2.pages.dev/'
    await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
    expect(f.calls.every(call => call.method === 'GET')).toBe(true)
  })
  it('does not mutate if durable authority is revoked during target verification', async () => {
    const f = provider(); f.options.beforeMutation.mockRejectedValue(Object.assign(Error('revoked'), { statusCode: 409 }))
    await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
    expect(f.calls.every(call => call.method === 'GET')).toBe(true)
  })
  it('does not report success when the canonical homepage is stale', async () => {
    const f = provider(); f.options.productionProbe.mockImplementation(async host => ({ status: 200, contentType: 'text/html', body: host === input.canonicalDomain ? 'stale' : 'target' }))
    await expect(f.run()).rejects.toMatchObject({ statusCode: 503 })
  })
})

async function authorityFixture() {
  const configuration = { ownerUserId: 1, capability: 'deployment', providerKey: 'internal-deployment-bearer-v1', readinessStatus: 'verified', credentialReference: 'envref:deployment-runtime', configurationFingerprint: hash, verificationReceiptFingerprint: 'b'.repeat(64), capabilityIdentity: 'cloudflare-pages:synthetic', verifiedAt: new Date('2026-10-01T00:00:00Z') }
  const project = { id: 2, ownerUserId: 1, status: 'active' }
  const from = { id: 4, ownerUserId: 1, projectId: 2, canonicalDomain: input.canonicalDomain, contentHash: 'c'.repeat(64), status: 'rollback_pending', activeDeploymentReceiptFingerprint: 'd'.repeat(64), projectionFingerprint: '1'.repeat(64) }
  const to = { ...from, id: 3, versionId: 7, contentHash: hash, status: 'rolled_back', activeDeploymentReceiptFingerprint: 'e'.repeat(64), projectionFingerprint: '2'.repeat(64) }
  const receipt = (row: typeof from, deployment: string) => ({ ownerUserId: 1, projectId: 2, releaseId: row.id, canonicalDomain: row.canonicalDomain, contentHash: row.contentHash, receiptStatus: 'verified', receiptType: 'production_deployment_verified', capability: 'deployment', providerKey: configuration.providerKey, verifiedAt: new Date(), externalReference: deployment, requestFingerprint: hash, receiptFingerprint: row.activeDeploymentReceiptFingerprint, metadata: {} as Record<string, unknown> })
  const source = receipt(from, input.sourceDeploymentId), target = receipt(to, input.targetDeploymentId)
  const repository = { findProviderConfiguration: vi.fn(async () => configuration), findRelease: vi.fn(async (_owner: number, id: number) => id === 4 ? from : to), findReceiptByFingerprint: vi.fn(async (_owner: number, fingerprint: string) => fingerprint === from.activeDeploymentReceiptFingerprint ? source : target) } as unknown as ManagedSiteLiveConnectorRepository
  const managedRepository = { findProject: vi.fn(async () => project) } as unknown as ManagedSiteRepository
  const credentialResolver = async () => ({ ok: true as const, value: 'synthetic' })
  const authority = await resolveManagedSiteProviderAuthority(1, 'deployment', 'live', repository, credentialResolver)
  source.metadata = managedSiteProviderAuthorityMetadata(authority); target.metadata = managedSiteProviderAuthorityMetadata(authority)
  const command = { ownerUserId: 1, projectId: 2, fromReleaseId: 4, toReleaseId: 3, versionId: 7, contentHash: hash, canonicalDomain: input.canonicalDomain, priorDeploymentReceiptFingerprint: target.receiptFingerprint, providerAuthority: authority, requestFingerprint: stableFingerprint({ operation: 'rollback', fromReleaseId: 4, toReleaseId: 3, priorDeploymentReceiptFingerprint: target.receiptFingerprint, targetContentHash: hash, providerAuthorityFingerprint: authority.authorityFingerprint }), timeoutMs: 30_000 }
  const run = () => resolveManagedSiteRollbackAuthority(command, { repository, managedRepository, credentialResolver })
  return { project, from, to, source, target, configuration, command, run }
}

describe('durable rollback authority and broker dispatch', () => {
  it('resolves deployment IDs only from exact owner-scoped receipts', async () => {
    const f = await authorityFixture()
    await expect(f.run()).resolves.toMatchObject({ sourceDeploymentId: input.sourceDeploymentId, targetDeploymentId: input.targetDeploymentId, targetRequestFingerprint: hash })
  })
  it.each(['owner', 'project', 'suspended', 'sourceState', 'targetReceipt', 'targetHash', 'provider', 'request', 'receiptScope'] as const)('blocks changed %s', async change => {
    const f = await authorityFixture()
    if (change === 'owner') f.project.ownerUserId = 9
    if (change === 'project') f.to.projectId = 9
    if (change === 'suspended') f.project.status = 'suspended'
    if (change === 'sourceState') f.from.status = 'live_verified'
    if (change === 'targetReceipt') f.target.receiptStatus = 'failed'
    if (change === 'targetHash') f.target.contentHash = 'f'.repeat(64)
    if (change === 'provider') f.configuration.verificationReceiptFingerprint = 'f'.repeat(64)
    if (change === 'request') f.command.requestFingerprint = 'f'.repeat(64)
    if (change === 'receiptScope') f.target.releaseId = 99
    await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
  })
  it('dispatches rollback through the authenticated broker and rejects malformed or unauthorized commands', async () => {
    const f = await authorityFixture(), cf = provider()
    const rollbackAuthorityResolver = vi.fn(async () => f.run())
    const broker = createManagedSiteInternalBrokerFetch({ credentialResolver: async () => ({ ok: true, value: 'synthetic' }), configurationResolver: () => ({ deploymentCredentialReference: 'envref:deployment-runtime', dnsTlsCredentialReference: 'envref:dns-runtime', cloudflare: { accountId: 'b'.repeat(32), apiTokenReference: 'envref:cf-runtime', projectPrefix: 'ds' } }), rollbackAuthorityResolver, cloudflareFetch: cf.options.fetchImpl, productionProbe: cf.options.productionProbe })
    const body = { schemaVersion: 'discoverystack-managed-deployment-command-v1', providerKey: 'internal-deployment-bearer-v1', operation: 'rollback', ...f.command }
    const call = (payload: unknown, bearer = 'synthetic') => broker(`${MANAGED_SITE_INTERNAL_BROKER_ORIGIN}/v1/managed-sites/rollback`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify(payload) })
    expect((await call(body, 'wrong')).status).toBe(401)
    expect((await call({ ...body, extra: true })).status).toBe(422)
    expect(rollbackAuthorityResolver).not.toHaveBeenCalled()
    const response = await call(body)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'rollback_verified', providerDeploymentId: input.targetDeploymentId, projectId: 2, versionId: 7 })
    expect(cf.calls.filter(call => call.method === 'POST')).toHaveLength(1)
  })
})
