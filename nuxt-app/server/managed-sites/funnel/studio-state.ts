import { createError } from 'h3'
import type { StudioBrief, StudioPreset, StudioPreview, StudioStrategy } from '../../../utils/managedSiteStudio'
import type { ManagedSiteBlueprintV1, ManagedSiteGenerationRequest } from '../live-connectors/types'
import { managedSiteStableFingerprint } from '../live-connectors/canonical'
import { mergeManagedSiteCopy } from '../live-connectors/blueprint-copy'
import { createStudioBlueprint, projectStudioCopy, validateStudioCopy } from './studio-intelligence'
import type { FunnelAnswers } from './session-service'

export type StoredStudioProposal = {
  id: string
  brief: StudioBrief
  blueprint: ManagedSiteBlueprintV1
  source: StudioPreview['source']
  sourceReason: string
  generatedAt: string
  strategy?: StudioStrategy
}
/** Server-only fields in the existing session JSON. Never admitted by ordinary answer PATCH. */
export type FunnelStudioState = {
  schemaVersion: 'funnel-studio-state-v1'
  proposals: StoredStudioProposal[]
  confirmed: null | { proposalId: string; preset: StudioPreset; answersFingerprint: string; confirmedAt: string }
}

export function studioConflict(): never {
  throw createError({ statusCode: 409, statusMessage: '網站提案已變更或尚未確認。請回到提案工作室，確認要建置的完整版本後再繼續。' })
}

export function studioContentAnswersFingerprint(answers: FunnelAnswers): string {
  // Modules are system-owned additions, reviewed again on the final release preview before checkout.
  return managedSiteStableFingerprint({ company: answers.company ?? null, siteType: answers.siteType ?? null, style: answers.style ?? null })
}

export function studioProposalId(sessionId: number, proposal: Omit<StoredStudioProposal, 'id'>): string {
  return managedSiteStableFingerprint({ scope: 'stored-studio-proposal-v1', sessionId, proposal })
}

export function findStudioProposal(sessionId: number, state: FunnelStudioState | undefined, id: string): StoredStudioProposal {
  if (state?.schemaVersion !== 'funnel-studio-state-v1' || !Array.isArray(state.proposals)) studioConflict()
  const proposal = state.proposals.find(item => item.id === id)
  if (!proposal) studioConflict()
  const { id: actualId, ...content } = proposal
  if (studioProposalId(sessionId, content) !== actualId) studioConflict()
  return proposal
}

export function confirmedStudioProposal(sessionId: number, answers: FunnelAnswers): StoredStudioProposal | null {
  if (!answers.studio) return null // Existing, non-studio journeys retain their original governed generator.
  const accepted = answers.studio.confirmed
  if (!accepted || accepted.answersFingerprint !== studioContentAnswersFingerprint(answers)) studioConflict()
  const proposal = findStudioProposal(sessionId, answers.studio, accepted.proposalId)
  if (proposal.brief.brandName !== answers.company?.brandName || proposal.brief.brief !== answers.company?.whatWeDo || proposal.brief.siteType !== answers.siteType || answers.style?.customerSitePreset !== accepted.preset) studioConflict()
  return proposal
}

/** Copy is frozen; only server-owned module slots, form endpoints and provenance are rebound. */
export function compileConfirmedStudioBlueprint(proposal: StoredStudioProposal, request: ManagedSiteGenerationRequest): ManagedSiteBlueprintV1 {
  const skeleton = createStudioBlueprint(request, proposal.brief)
  const copy = validateStudioCopy(projectStudioCopy(proposal.blueprint), skeleton)
  const blueprint = mergeManagedSiteCopy(skeleton, copy, JSON.stringify(copy))
  if (managedSiteStableFingerprint(projectStudioCopy(blueprint)) !== managedSiteStableFingerprint(copy)) studioConflict()
  return blueprint
}
