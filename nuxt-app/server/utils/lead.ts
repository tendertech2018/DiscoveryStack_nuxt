import { and, eq, gt } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { getDatabase } from '../database'
import { leads } from '../database/schema'
import { leadDedupeKey, modelImprovementConsentReceipt, type LeadInput } from './leadInput'
import { createBoundedProcessRateLimiter, directPeerRequestFingerprint } from './publicRequestGuard'

const DEDUPE_WINDOW_MS = 15 * 60 * 1_000
const RATE_WINDOW_MS = 60 * 60 * 1_000
const RATE_LIMIT = 5
const GLOBAL_RATE_LIMIT = 500
const MAX_RATE_BUCKETS = 10_000
const leadRateLimiter = createBoundedProcessRateLimiter({
  windowMs: RATE_WINDOW_MS,
  peerLimit: RATE_LIMIT,
  globalLimit: GLOBAL_RATE_LIMIT,
  maxBuckets: MAX_RATE_BUCKETS,
  statusMessage: 'Too many submissions. Please try again later.',
})

export function requestFingerprint(event: H3Event) {
  return directPeerRequestFingerprint(event, 'public-contact-v2')
}

export function enforceLeadRateLimit(fingerprint: string) {
  leadRateLimiter.enforce(fingerprint)
}

export function resetLeadRateLimitsForTests() {
  leadRateLimiter.resetForTests()
}

export async function storeLead(event: H3Event, input: LeadInput) {
  const database = getDatabase()
  if (!database) throw createError({ statusCode: 503, statusMessage: 'Lead capture is temporarily unavailable.' })

  const dedupeKey = leadDedupeKey(input)
  const fingerprint = requestFingerprint(event)
  enforceLeadRateLimit(fingerprint)
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS)
  const existing = await database.select({ id: leads.id, modelImprovementConsent: leads.modelImprovementConsent }).from(leads)
    .where(and(eq(leads.dedupeKey, dedupeKey), gt(leads.createdAt, since))).limit(1)
  const duplicate = existing[0]
  if (duplicate) {
    if (input.modelImprovementConsent && !duplicate.modelImprovementConsent) {
      await database.update(leads)
        .set(modelImprovementConsentReceipt(true))
        .where(eq(leads.id, duplicate.id))
    }
    return { received: true, duplicate: true } as const
  }

  await database.insert(leads).values({
    name: input.name,
    email: input.email,
    company: input.company,
    website: input.website || null,
    packageInterest: input.packageInterest,
    language: input.language,
    message: input.message || null,
    privacyConsent: input.privacyConsent,
    recontactConsent: input.recontactConsent,
    ...modelImprovementConsentReceipt(input.modelImprovementConsent),
    dedupeKey,
    requestFingerprint: fingerprint,
  })
  return { received: true, duplicate: false } as const
}
