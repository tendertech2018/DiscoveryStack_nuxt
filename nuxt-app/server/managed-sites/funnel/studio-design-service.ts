import { createError } from 'h3'
import { isStudioDesign, legibleInk, type StudioDesign } from '../../../utils/managedSitePresentation'
import type { ManagedSiteFunnelSession } from '../../database/schema'
import { funnelSessionRevision, type FunnelSessionRepository } from './session-repository'
import type { FunnelAnswers } from './session-service'
import { findStudioProposal, studioConflict, studioProposalId, type StoredStudioProposal } from './studio-state'
import { renderStudioProposal } from './studio-preview'

/** A direct visual edit never calls an AI/provider and cannot modify copy, links or media. */
export async function reviseStudioDesign(session: ManagedSiteFunnelSession, input: { proposalId: unknown; design: unknown }, repository: FunnelSessionRepository, clock: () => Date = () => new Date()) {
  if (session.status !== 'active' || session.previewId || session.projectId || session.releaseId) studioConflict()
  if (typeof input.proposalId !== 'string' || !/^[a-f0-9]{64}$/u.test(input.proposalId)) studioConflict()
  const revision = funnelSessionRevision(session), answers = structuredClone(session.answers || {}) as FunnelAnswers
  const base = findStudioProposal(session.id, answers.studio, input.proposalId)
  if (!base.blueprint.studioPresentation) studioConflict()
  if (!input.design || typeof input.design !== 'object' || Array.isArray(input.design) || Object.getPrototypeOf(input.design) !== Object.prototype || Object.keys(input.design).some(key => !['canvas', 'accent', 'typography', 'motion', 'layout', 'tuning'].includes(key)) || !Object.keys(input.design).length) throw createError({ statusCode: 422, statusMessage: 'Choose supported visual settings.' })
  const next = { ...base.blueprint.studioPresentation.design, ...input.design } as StudioDesign
  if (!isStudioDesign(next)) throw createError({ statusCode: 422, statusMessage: 'Visual settings are invalid.' })
  if (Object.hasOwn(input.design, 'canvas')) { next.surface = next.canvas; next.ink = legibleInk(next.canvas, next.ink) }
  const blueprint = structuredClone(base.blueprint)
  blueprint.studioPresentation!.design = next
  const same = JSON.stringify(blueprint) === JSON.stringify(base.blueprint)
  let proposal = base
  if (!same) {
    const { id: _id, ...prior } = base
    const content: Omit<StoredStudioProposal, 'id'> = { ...prior, blueprint, generatedAt: clock().toISOString() }
    proposal = { ...content, id: studioProposalId(session.id, content) }
    const studio = answers.studio!
    const pinned = studio.proposals.find(item => item.id === studio.confirmed?.proposalId)
    studio.proposals = [...studio.proposals.filter(item => item.id !== proposal.id), proposal].slice(-6)
    if (pinned && !studio.proposals.some(item => item.id === pinned.id)) studio.proposals.unshift(pinned)
    while (Buffer.byteLength(JSON.stringify(answers), 'utf8') > 600_000 || Buffer.byteLength(JSON.stringify(studio), 'utf8') > 512_000) {
      const index = studio.proposals.findIndex(item => item.id !== proposal.id && item.id !== studio.confirmed?.proposalId)
      if (index < 0) throw createError({ statusCode: 413, statusMessage: 'The saved proposal is too large.' })
      studio.proposals.splice(index, 1)
    }
    if (!await repository.transitionSession(session.id, 'active', { answers }, revision)) studioConflict()
  }
  return renderStudioProposal(proposal.blueprint, { source: proposal.source, sourceReason: proposal.sourceReason, generatedAt: proposal.generatedAt, strategy: proposal.strategy, proposalId: proposal.id, changes: [] })
}
