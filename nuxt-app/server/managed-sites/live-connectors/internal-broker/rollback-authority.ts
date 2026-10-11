import { createError } from 'h3'
import { stableFingerprint } from '../../../seo-geo-core/repository'
import { getManagedSiteRepository } from '../../repository'
import type { ManagedSiteRepository } from '../../types'
import { getManagedSiteLiveConnectorRepository } from '../repository'
import { managedSiteProviderAuthorityMetadata, resolveManagedSiteCredential, resolveManagedSiteProviderAuthority } from '../provider-registry'
import type { ManagedSiteCredentialResolver, ManagedSiteDeploymentAdapter, ManagedSiteLiveConnectorRepository } from '../types'

export type ManagedSiteRollbackCommand = Parameters<ManagedSiteDeploymentAdapter['rollback']>[0]
export type ManagedSiteRollbackAuthority = { fingerprint: string; sourceDeploymentId: string; targetDeploymentId: string; targetRequestFingerprint: string }
export type ManagedSiteRollbackAuthorityResolver = (command: ManagedSiteRollbackCommand) => Promise<ManagedSiteRollbackAuthority>
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
function conflict(): never { throw createError({ statusCode: 409, statusMessage: 'Rollback requires the exact current owner, project, release and verified deployment authority.' }) }

/** The bearer proves transport identity, not permission to roll back an arbitrary customer's site. */
export async function resolveManagedSiteRollbackAuthority(command: ManagedSiteRollbackCommand, dependencies: { repository?: ManagedSiteLiveConnectorRepository; managedRepository?: ManagedSiteRepository; credentialResolver?: ManagedSiteCredentialResolver } = {}): Promise<ManagedSiteRollbackAuthority> {
  const repository = dependencies.repository || getManagedSiteLiveConnectorRepository()
  const managed = dependencies.managedRepository || getManagedSiteRepository()
  const project = await managed.findProject(command.ownerUserId, command.projectId)
  if (!project || project.ownerUserId !== command.ownerUserId || ['suspended', 'archived'].includes(project.status)) conflict()
  const from = await repository.findRelease(command.ownerUserId, command.fromReleaseId)
  const to = await repository.findRelease(command.ownerUserId, command.toReleaseId)
  if (!from || !to || from.id === to.id || from.status !== 'rollback_pending' || !from.activeDeploymentReceiptFingerprint || to.activeDeploymentReceiptFingerprint !== command.priorDeploymentReceiptFingerprint || to.versionId !== command.versionId || to.contentHash !== command.contentHash || [from, to].some(row => row.ownerUserId !== command.ownerUserId || row.projectId !== command.projectId || row.canonicalDomain !== command.canonicalDomain)) conflict()
  const source = await repository.findReceiptByFingerprint(command.ownerUserId, from.activeDeploymentReceiptFingerprint)
  const target = await repository.findReceiptByFingerprint(command.ownerUserId, command.priorDeploymentReceiptFingerprint)
  const current = await resolveManagedSiteProviderAuthority(command.ownerUserId, 'deployment', 'live', repository, dependencies.credentialResolver || resolveManagedSiteCredential)
  if (current.providerKey !== 'internal-deployment-bearer-v1' || stableFingerprint(current) !== stableFingerprint(command.providerAuthority)) conflict()
  for (const [receipt, release] of [[source, from], [target, to]] as const) {
    if (!receipt || receipt.ownerUserId !== command.ownerUserId || receipt.projectId !== command.projectId || receipt.releaseId !== release.id || receipt.canonicalDomain !== command.canonicalDomain || receipt.contentHash !== release.contentHash || receipt.receiptStatus !== 'verified' || receipt.capability !== 'deployment' || receipt.providerKey !== current.providerKey || !receipt.verifiedAt || !receipt.externalReference || receipt.receiptFingerprint !== release.activeDeploymentReceiptFingerprint || !['production_deployment_verified', 'rollback_deployment_verified'].includes(receipt.receiptType) || Object.entries(managedSiteProviderAuthorityMetadata(current)).some(([key, value]) => record(receipt.metadata)[key] !== value)) conflict()
  }
  if (!target || !source || target.receiptType !== 'production_deployment_verified' || !/^[a-f0-9]{64}$/u.test(target.requestFingerprint)) conflict()
  const expected = stableFingerprint({ operation: 'rollback', fromReleaseId: from.id, toReleaseId: to.id, priorDeploymentReceiptFingerprint: target.receiptFingerprint, targetContentHash: to.contentHash, providerAuthorityFingerprint: current.authorityFingerprint })
  if (command.requestFingerprint !== expected) conflict()
  return { sourceDeploymentId: source.externalReference!, targetDeploymentId: target.externalReference!, targetRequestFingerprint: target.requestFingerprint, fingerprint: stableFingerprint({ command, from: from.projectionFingerprint, to: to.projectionFingerprint, source: source.receiptFingerprint, target: target.receiptFingerprint }) }
}
