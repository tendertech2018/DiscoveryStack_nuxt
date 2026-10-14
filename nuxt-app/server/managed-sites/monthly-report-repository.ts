import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { createError } from 'h3'
import { getDatabase } from '../database'
import { llmVisibilityObservations, llmVisibilityObservationReviews, llmVisibilityProjects, llmVisibilityPromptVersions, llmVisibilityQueries, llmVisibilityRuns } from '../database/schema'
import type { MonthlyEvidence } from './monthly-report'

export type MonthlyEvidenceReader = (ownerUserId: number, projectId: number, domain: string, from: Date, until: Date) => Promise<MonthlyEvidence>

export const readMonthlyVisibilityEvidence: MonthlyEvidenceReader = async (ownerUserId, projectId, domain, from, until) => {
  const database = getDatabase()
  if (!database) throw createError({ statusCode: 503, statusMessage: 'Monthly reporting is temporarily unavailable.' })
  return database.transaction(async transaction => {
    const [project] = await transaction.select({ id: llmVisibilityProjects.id }).from(llmVisibilityProjects).where(and(eq(llmVisibilityProjects.id, projectId), eq(llmVisibilityProjects.ownerUserId, ownerUserId), eq(llmVisibilityProjects.canonicalDomain, domain), eq(llmVisibilityProjects.status, 'active'))).limit(1)
    if (!project) throw createError({ statusCode: 409, statusMessage: 'The report website is no longer active.' })
    const queries = await transaction.select({ id: llmVisibilityQueries.id, promptText: llmVisibilityQueries.promptText, locale: llmVisibilityQueries.locale, active: llmVisibilityQueries.active }).from(llmVisibilityQueries)
      .where(and(eq(llmVisibilityQueries.ownerUserId, ownerUserId), eq(llmVisibilityQueries.projectId, projectId), lt(llmVisibilityQueries.createdAt, until))).orderBy(llmVisibilityQueries.id).limit(501)
    if (queries.length > 500) throw createError({ statusCode: 409, statusMessage: 'Too many questions for a complete monthly report.' })
    const rows = await transaction.select({
      id: llmVisibilityObservations.id, queryId: llmVisibilityObservations.queryId,
      promptVersionId: llmVisibilityObservations.promptVersionId, promptText: llmVisibilityPromptVersions.promptText,
      locale: llmVisibilityQueries.locale, provider: llmVisibilityRuns.provider,
      observedAt: llmVisibilityRuns.observedAt, observationMode: llmVisibilityRuns.observationMode,
      brandMentioned: llmVisibilityObservations.brandMentioned, citationUrls: llmVisibilityObservations.citationUrls,
    }).from(llmVisibilityObservations)
      .innerJoin(llmVisibilityRuns, and(eq(llmVisibilityRuns.id, llmVisibilityObservations.runId), eq(llmVisibilityRuns.ownerUserId, ownerUserId), eq(llmVisibilityRuns.projectId, projectId)))
      .innerJoin(llmVisibilityQueries, and(eq(llmVisibilityQueries.id, llmVisibilityObservations.queryId), eq(llmVisibilityQueries.ownerUserId, ownerUserId), eq(llmVisibilityQueries.projectId, projectId)))
      .leftJoin(llmVisibilityPromptVersions, and(eq(llmVisibilityPromptVersions.id, llmVisibilityObservations.promptVersionId), eq(llmVisibilityPromptVersions.ownerUserId, ownerUserId), eq(llmVisibilityPromptVersions.projectId, projectId), eq(llmVisibilityPromptVersions.queryId, llmVisibilityObservations.queryId)))
      .where(and(eq(llmVisibilityObservations.ownerUserId, ownerUserId), eq(llmVisibilityObservations.projectId, projectId), eq(llmVisibilityRuns.status, 'completed'), eq(llmVisibilityRuns.observationMode, 'manual_verified'), gte(llmVisibilityRuns.observedAt, from), lt(llmVisibilityRuns.observedAt, until)))
      .orderBy(desc(llmVisibilityRuns.observedAt), llmVisibilityObservations.id).limit(2001)
    if (rows.length > 2000) throw createError({ statusCode: 409, statusMessage: 'Too many observations for a complete monthly report.' })
    const reviews: Array<{ observationId: number; newStatus: 'approved' | 'revoked' }> = []
    for (let index = 0; index < rows.length; index += 500) {
      // At most one approval and one terminal revocation per observation by DB constraint.
      const batch = await transaction.select({ observationId: llmVisibilityObservationReviews.observationId, newStatus: llmVisibilityObservationReviews.newStatus }).from(llmVisibilityObservationReviews)
        .where(and(eq(llmVisibilityObservationReviews.ownerUserId, ownerUserId), inArray(llmVisibilityObservationReviews.observationId, rows.slice(index, index + 500).map(row => row.id)))).limit(1001)
      if (batch.length > 1000) throw createError({ statusCode: 409, statusMessage: 'Invalid observation review history.' })
      reviews.push(...batch)
    }
    const approved = new Set(reviews.filter(row => row.newStatus === 'approved').map(row => row.observationId))
    const revoked = new Set(reviews.filter(row => row.newStatus === 'revoked').map(row => row.observationId))
    return { queries, observations: rows.map(row => {
      if (row.promptVersionId !== null && row.promptText === null) throw createError({ statusCode: 409, statusMessage: 'Historical question identity is unavailable.' })
      if (!Array.isArray(row.citationUrls) || !row.citationUrls.every(url => typeof url === 'string')) throw createError({ statusCode: 409, statusMessage: 'Invalid stored citation evidence.' })
      return { id: row.id, queryId: row.queryId, promptText: row.promptText, locale: row.locale, provider: row.provider, observedAt: row.observedAt, observationMode: row.observationMode, brandMentioned: row.brandMentioned, citationUrls: row.citationUrls as string[], reviewStatus: revoked.has(row.id) ? 'revoked' as const : approved.has(row.id) ? 'approved' as const : 'pending' as const }
    }) }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
