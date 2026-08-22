import { and, eq } from 'drizzle-orm'
import { getDatabase } from '../../../../../../database'
import { growthExperimentVariants, growthExperiments } from '../../../../../../database/schema'
import { requireOwner } from '../../../../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const experimentId = Number(event.context.params?.id)
  const variantId = Number(event.context.params?.variantId)
  const body = await readBody<{ factualityStatus?: 'passed' | 'failed', qualityStatus?: 'passed' | 'failed' }>(event)
  if (!Number.isInteger(experimentId) || experimentId < 1 || !Number.isInteger(variantId) || variantId < 1 || !['passed', 'failed'].includes(body?.factualityStatus || '') || !['passed', 'failed'].includes(body?.qualityStatus || '')) throw createError({ statusCode: 422, statusMessage: 'A complete variant review is required.' })
  const database = getDatabase()
  if (!database) throw createError({ statusCode: 503, statusMessage: 'Growth research ledger is temporarily unavailable.' })
  const [experiment] = await database.select({ status: growthExperiments.status }).from(growthExperiments).where(eq(growthExperiments.id, experimentId)).limit(1)
  if (!experiment || ['revoked', 'rejected'].includes(experiment.status)) throw createError({ statusCode: 409, statusMessage: 'This experiment cannot accept variant reviews.' })
  const result = await database.update(growthExperimentVariants).set({ factualityStatus: body.factualityStatus!, qualityStatus: body.qualityStatus! }).where(and(eq(growthExperimentVariants.id, variantId), eq(growthExperimentVariants.experimentId, experimentId)))
  if (!result[0].affectedRows) throw createError({ statusCode: 404, statusMessage: 'Growth experiment variant was not found.' })
  return { ok: true }
})
