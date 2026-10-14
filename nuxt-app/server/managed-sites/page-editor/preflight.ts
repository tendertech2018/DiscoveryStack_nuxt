import { createError } from 'h3'
import { canonicalFingerprint, parsePageDocument } from './canonical'
import { compilePageDocument } from './compiler'
import type { CompiledPageArtifact, MediaAuthorityResolver, PageActor, PageBlock, PageEditorRepository } from './types'
import type { ManagedSitePageReview } from '../../../utils/managedSitePageReview'

/** Deterministic technical checks, never a prediction of third-party AI answers. */
export function pagePreflightFindings(artifact: CompiledPageArtifact): ManagedSitePageReview['findings'] {
  const findings: ManagedSitePageReview['findings'] = []
  if (!artifact.blocks.some(block => !['spacer', 'divider'].includes(block.type))) findings.push({ code: 'no_visible_content', severity: 'warning', blockId: null })
  if (artifact.seo.noindex) findings.push({ code: 'search_excluded', severity: 'warning', blockId: null })
  const hasAction = (value: unknown): boolean => Boolean(value && typeof value === 'object' && (Array.isArray(value) ? value.some(hasAction) : Object.entries(value).some(([key, item]) => key === 'href' && typeof item === 'string' && item.trim() || hasAction(item))))
  if (!artifact.blocks.some(block => ['contact', 'booking_intent'].includes(block.type) || hasAction(block.data))) findings.push({ code: 'no_primary_action', severity: 'warning', blockId: null })
  for (const block of artifact.blocks) {
    if (block.type === 'contact' && (!Array.isArray(block.data.fields) || !['name', 'email', 'message'].every(field => (block.data.fields as unknown[]).includes(field)))) findings.push({ code: 'contact_fields_missing', severity: 'blocking', blockId: block.blockId })
    if (block.type === 'booking_intent') findings.push({ code: 'booking_is_inquiry', severity: 'warning', blockId: block.blockId })
  }
  return findings
}

export function assertPagePreflight(artifact: CompiledPageArtifact): void {
  const blockers = pagePreflightFindings(artifact).filter(finding => finding.severity === 'blocking')
  if (blockers.length) throw createError({ statusCode: 409, statusMessage: 'Page contact fields are incomplete; no publication was queued.', data: { code: 'PAGE_PREFLIGHT_BLOCKED', findings: blockers } })
}

function blockText(block: PageBlock): string {
  const textKeys = new Set(['title', 'description', 'eyebrow', 'text', 'question', 'answer', 'summary', 'quote', 'person', 'name', 'role', 'bio', 'caption', 'label', 'href'])
  const walk = (value: unknown, key = ''): string[] => {
    if (typeof value === 'string') return textKeys.has(key) || key === 'items' ? [value] : []
    if (Array.isArray(value)) return value.flatMap(item => walk(item, key))
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([field, item]) => walk(item, field))
    return []
  }
  return walk(block.data).join('\n')
}

/** Read-only; never queues publication, sends notifications, or calls a model. */
export async function reviewManagedPage(input: { repository: PageEditorRepository; actor: PageActor; pageId: string; expectedPageVersion: number; compareVersion?: number; resolveMedia: MediaAuthorityResolver; now?: Date }): Promise<ManagedSitePageReview> {
  const { actor, repository } = input
  if (!Number.isSafeInteger(actor.ownerUserId) || actor.ownerUserId < 1 || !Number.isSafeInteger(actor.projectId) || actor.projectId < 1) throw createError({ statusCode: 403, statusMessage: 'Invalid page review authority.' })
  const found = await repository.findCurrent(actor.ownerUserId, actor.projectId, input.pageId)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Page not found in this managed site.' })
  const page = parsePageDocument(found)
  if (page.version !== input.expectedPageVersion) throw createError({ statusCode: 409, statusMessage: 'Page changed. Review the current version before continuing.' })
  const now = input.now || new Date()
  // Publish-mode compilation validates public media rights; it does not publish.
  const artifact = await compilePageDocument({ actor, document: page, resolveMedia: input.resolveMedia, mode: 'publish', now })
  const findings = pagePreflightFindings(artifact)
  if (page.sections.some(block => block.schedule)) findings.push({ code: 'scheduled_content', severity: 'warning', blockId: null })
  const compareVersion = input.compareVersion ?? page.parentVersion
  let comparison: ManagedSitePageReview['comparison'] = null
  if (compareVersion !== null) {
    if (!Number.isSafeInteger(compareVersion) || compareVersion < 1 || compareVersion >= page.version) throw createError({ statusCode: 422, statusMessage: 'Comparison must use an earlier saved page version.' })
    const foundBefore = await repository.findVersion(actor.ownerUserId, actor.projectId, page.pageId, compareVersion)
    if (!foundBefore) throw createError({ statusCode: 404, statusMessage: 'Earlier page version not found in this managed site.' })
    const before = parsePageDocument(foundBefore)
    if (before.pageId !== page.pageId || before.version !== compareVersion) throw createError({ statusCode: 409, statusMessage: 'Page comparison identity mismatch.' })
    const changes: NonNullable<ManagedSitePageReview['comparison']>['changes'] = []
    for (const block of before.sections) if (!page.sections.some(item => item.blockId === block.blockId)) changes.push({ blockId: block.blockId, kind: 'removed', before: blockText(block), after: null })
    for (const [index, block] of page.sections.entries()) {
      const priorIndex = before.sections.findIndex(item => item.blockId === block.blockId), prior = before.sections[priorIndex]
      if (!prior) changes.push({ blockId: block.blockId, kind: 'added', before: null, after: blockText(block) })
      else if (canonicalFingerprint(prior) !== canonicalFingerprint(block) || canonicalFingerprint(before.mediaBindings.filter(binding => prior.mediaBindingIds.includes(binding.bindingId))) !== canonicalFingerprint(page.mediaBindings.filter(binding => block.mediaBindingIds.includes(binding.bindingId)))) changes.push({ blockId: block.blockId, kind: 'updated', before: blockText(prior), after: blockText(block) })
      else if (index !== priorIndex) changes.push({ blockId: block.blockId, kind: 'moved', before: blockText(prior), after: blockText(block) })
    }
    comparison = { fromVersion: before.version, toVersion: page.version, beforeFingerprint: before.fingerprint, afterFingerprint: page.fingerprint, seoChanged: canonicalFingerprint(before.seo) !== canonicalFingerprint(page.seo), designChanged: canonicalFingerprint([before.designTokens, before.designThemeId, before.designTokenVersion]) !== canonicalFingerprint([page.designTokens, page.designThemeId, page.designTokenVersion]), changes }
  }
  const current = await repository.findCurrent(actor.ownerUserId, actor.projectId, input.pageId)
  if (current?.fingerprint !== page.fingerprint) throw createError({ statusCode: 409, statusMessage: 'Page changed during review. Retry with the current version.' })
  const report = { schemaVersion: 'managed-site-page-review-v1' as const, pageId: page.pageId, pageVersion: page.version, pageFingerprint: page.fingerprint, artifactFingerprint: artifact.artifactFingerprint, locale: page.locale, reviewedAt: now.toISOString(), technicalStatus: findings.some(item => item.severity === 'blocking') ? 'blocked' as const : 'passed' as const, findings, checked: ['document_integrity', 'media_authority', 'responsive_definitions', 'contact_field_contract'] as const, unverified: ['business_fact_accuracy', 'browser_mobile_desktop', 'external_link_availability', 'live_form_delivery', 'citation_performance'] as const, comparison }
  return { ...report, fingerprint: canonicalFingerprint(report) }
}
