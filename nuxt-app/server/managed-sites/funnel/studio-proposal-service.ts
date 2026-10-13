import { createError } from 'h3'
import type { ManagedSiteFunnelSession } from '../../database/schema'
import { studioAnswers, studioBriefKey, type StudioPreviewRequest, type StudioPreset, type StudioSelection } from '../../../utils/managedSiteStudio'
import { normalizedModulesForSiteType } from '../../../utils/managedSiteFunnel'
import { managedSiteStableFingerprint } from '../live-connectors/canonical'
import type { ManagedSiteBlueprintV1 } from '../live-connectors/types'
import { generateStudioPreview, renderStudioProposal } from './studio-preview'
import { projectStudioCopy } from './studio-intelligence'
import type { FunnelPreviewDraftDependencies } from './preview-draft-service'
import { funnelSessionRevision, type FunnelSessionRepository } from './session-repository'
import type { FunnelAnswers } from './session-service'
import { findStudioProposal, studioContentAnswersFingerprint, studioConflict, studioProposalId, type FunnelStudioState, type StoredStudioProposal } from './studio-state'

function mutable(session: ManagedSiteFunnelSession) {
  if (session.status !== 'active' || session.previewId || session.projectId || session.releaseId) studioConflict()
}

export async function generateAndStoreStudioProposal(session: ManagedSiteFunnelSession, input: StudioPreviewRequest, repository: FunnelSessionRepository, dependencies: FunnelPreviewDraftDependencies = {}) {
  mutable(session)
  const revision = funnelSessionRevision(session)
  const answers = structuredClone(session.answers || {}) as FunnelAnswers
  if (input.revision) {
    const base = findStudioProposal(session.id, answers.studio, input.revision.proposalId || '')
    if (studioBriefKey(base.brief) !== studioBriefKey(input) || managedSiteStableFingerprint(projectStudioCopy(base.blueprint)) !== managedSiteStableFingerprint(input.revision.base)) studioConflict()
  }
  let blueprint: ManagedSiteBlueprintV1 | undefined
  const preview = await generateStudioPreview(session, input, { ...dependencies, onBlueprint: value => { blueprint = value } })
  if (!blueprint) throw createError({ statusCode: 503, statusMessage: '完整提案尚未完成，請稍後再試。' })
  const content: Omit<StoredStudioProposal, 'id'> = {
    brief: { brandName: input.brandName, brief: input.brief, siteType: input.siteType, goal: input.goal },
    blueprint, source: preview.source, sourceReason: preview.sourceReason, generatedAt: preview.generatedAt,
    ...(preview.strategy ? { strategy: preview.strategy } : {}),
  }
  const proposal = { ...content, id: studioProposalId(session.id, content) }
  const previous = answers.studio
  // Keep the confirmed version pinned, plus the six most recent versions for local undo.
  const recent = [...(previous?.proposals || []).filter(item => item.id !== proposal.id), proposal].slice(-6)
  const pinned = previous?.proposals.find(item => item.id === previous.confirmed?.proposalId)
  if (pinned && !recent.some(item => item.id === pinned.id)) recent.unshift(pinned)
  const studio: FunnelStudioState = { schemaVersion: 'funnel-studio-state-v1', proposals: recent, confirmed: previous?.confirmed || null }
  if (Buffer.byteLength(JSON.stringify(studio), 'utf8') > 512_000) throw createError({ statusCode: 413, statusMessage: '提案內容過大，請縮短文案後再試。' })
  const updated = await repository.transitionSession(session.id, 'active', { answers: { ...answers, studio } }, revision)
  if (!updated) studioConflict()
  return { ...preview, proposalId: proposal.id }
}

export async function confirmStudioProposal(session: ManagedSiteFunnelSession, input: { proposalId: unknown; preset: unknown }, repository: FunnelSessionRepository, clock: () => Date = () => new Date()) {
  mutable(session)
  const revision = funnelSessionRevision(session)
  if (typeof input.proposalId !== 'string' || !/^[a-f0-9]{64}$/u.test(input.proposalId) || !['atelier', 'bloom', 'alignment'].includes(String(input.preset))) studioConflict()
  const answers = structuredClone(session.answers || {}) as FunnelAnswers
  const proposal = findStudioProposal(session.id, answers.studio, input.proposalId)
  const preset = input.preset as StudioPreset
  const selected = studioAnswers(proposal.brief, preset)
  const next: FunnelAnswers = {
    ...answers, ...selected,
    existingSite: answers.existingSite || { hasSite: false },
    style: { ...selected.style!, designTier: answers.style?.designTier || 'template', referenceUrls: answers.style?.referenceUrls || [] },
    modules: normalizedModulesForSiteType(proposal.brief.siteType, answers.modules),
    previewDraft: { source: proposal.source, generatedAt: proposal.generatedAt, headline: proposal.blueprint.pages[0]!.title, sections: proposal.blueprint.pages[0]!.sections.map(({ heading, body }) => ({ heading, body: body.slice(0, 2000) })) },
  }
  next.studio = { ...answers.studio!, confirmed: { proposalId: proposal.id, preset, answersFingerprint: studioContentAnswersFingerprint(next), confirmedAt: clock().toISOString() } }
  const updated = await repository.transitionSession(session.id, 'active', { answers: next, currentStep: Math.max(session.currentStep, 2) }, revision)
  if (!updated) studioConflict()
  return updated
}

export function restoreStudioProposal(session: ManagedSiteFunnelSession): StudioSelection | null {
  const answers = session.answers as FunnelAnswers
  const state = answers?.studio
  const id = state?.confirmed?.proposalId || state?.proposals.at(-1)?.id
  if (!id) return null
  const proposal = findStudioProposal(session.id, state, id)
  return {
    brief: proposal.brief,
    preset: state?.confirmed?.preset || proposal.strategy?.recommendedPreset || 'atelier',
    preview: renderStudioProposal(proposal.blueprint, { source: proposal.source, sourceReason: proposal.sourceReason, generatedAt: proposal.generatedAt, strategy: proposal.strategy, proposalId: proposal.id, changes: [] }),
  }
}

export function studioSessionProjection(session: ManagedSiteFunnelSession) {
  const { studio, ...answers } = (session.answers || {}) as FunnelAnswers
  const confirmed = Boolean(studio?.confirmed && studio.confirmed.answersFingerprint === studioContentAnswersFingerprint(answers))
  return { answers, studio: studio ? { confirmed, hasProposal: studio.proposals.length > 0, proposalId: studio.confirmed?.proposalId || null } : null }
}
