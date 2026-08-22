import { eq } from 'drizzle-orm'
import { getDatabase } from '../../../../database'
import { growthExperimentReviews, growthExperiments, users } from '../../../../database/schema'
import { requireOwner } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const owner = await requireOwner(event)
  const experimentId = Number(event.context.params?.id)
  const body = await readBody<{ decision?: 'approved' | 'needs_revision' | 'rejected', factualityDecision?: 'passed' | 'failed', brandQualityDecision?: 'passed' | 'failed', approvedForDataset?: boolean, reviewNote?: string }>(event)
  if (!Number.isInteger(experimentId) || !['approved', 'needs_revision', 'rejected'].includes(body?.decision || '') || !['passed', 'failed'].includes(body?.factualityDecision || '') || !['passed', 'failed'].includes(body?.brandQualityDecision || '')) throw createError({ statusCode: 422, statusMessage: 'A complete human review is required.' })
  const database = getDatabase()
  if (!database) throw createError({ statusCode: 503, statusMessage: 'Growth research ledger is temporarily unavailable.' })
  if (body.approvedForDataset === true && (body.decision !== 'approved' || body.factualityDecision !== 'passed' || body.brandQualityDecision !== 'passed')) throw createError({ statusCode: 422, statusMessage: 'Dataset approval requires an approved review with factuality and brand quality passed.' })
  const [reviewer] = await database.select({ id: users.id }).from(users).where(eq(users.openId, owner.openId)).limit(1)
  if (!reviewer) throw createError({ statusCode: 403, statusMessage: 'Owner record is unavailable.' })
  await database.transaction(async (tx) => {
    const [experiment] = await tx.select({ status: growthExperiments.status }).from(growthExperiments).where(eq(growthExperiments.id, experimentId)).limit(1)
    if (!experiment) throw createError({ statusCode: 404, statusMessage: 'Growth experiment was not found.' })
    if (experiment.status === 'revoked') throw createError({ statusCode: 409, statusMessage: 'A revoked experiment cannot be reviewed.' })
    await tx.insert(growthExperimentReviews).values({ experimentId, reviewerUserId: reviewer.id, decision: body.decision!, factualityDecision: body.factualityDecision!, brandQualityDecision: body.brandQualityDecision!, approvedForDataset: body.approvedForDataset === true, reviewNote: body.reviewNote?.slice(0, 4000) || null })
    await tx.update(growthExperiments).set({ status: body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : 'ready_for_review', completedAt: body.decision === 'needs_revision' ? null : new Date(), autoPublish: false }).where(eq(growthExperiments.id, experimentId))
  })
  return { ok: true, autoPublish: false }
})
