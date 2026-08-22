import { desc, eq } from 'drizzle-orm'
import { getDatabase } from '../../../../database'
import { growthResearchConsents, growthResearchIntakes } from '../../../../database/schema'
import { requireOwner } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const intakeId = Number(event.context.params?.id)
  const body = await readBody<{ status?: 'approved' | 'rejected', ownerReviewNote?: string }>(event)
  if (!Number.isInteger(intakeId) || !['approved', 'rejected'].includes(body?.status || '')) throw createError({ statusCode: 422, statusMessage: 'A valid intake review decision is required.' })
  const database = getDatabase()
  if (!database) throw createError({ statusCode: 503, statusMessage: 'Growth research ledger is temporarily unavailable.' })
  const [intake] = await database.select({ leadId: growthResearchIntakes.leadId, status: growthResearchIntakes.status, consentRevokedAt: growthResearchIntakes.consentRevokedAt }).from(growthResearchIntakes).where(eq(growthResearchIntakes.id, intakeId)).limit(1)
  if (!intake) throw createError({ statusCode: 404, statusMessage: 'Growth intake was not found.' })
  const [latestConsent] = await database.select({ action: growthResearchConsents.action }).from(growthResearchConsents).where(eq(growthResearchConsents.leadId, intake.leadId)).orderBy(desc(growthResearchConsents.occurredAt), desc(growthResearchConsents.id)).limit(1)
  if (intake.status === 'revoked' || intake.consentRevokedAt || latestConsent?.action !== 'granted') throw createError({ statusCode: 409, statusMessage: 'A revoked intake cannot be reviewed or restored.' })
  const result = await database.update(growthResearchIntakes).set({ status: body.status!, ownerReviewNote: (body.ownerReviewNote || '').slice(0, 4000) || null, reviewedAt: new Date() }).where(eq(growthResearchIntakes.id, intakeId))
  if (!result[0].affectedRows) throw createError({ statusCode: 404, statusMessage: 'Growth intake was not found.' })
  return { ok: true }
})
