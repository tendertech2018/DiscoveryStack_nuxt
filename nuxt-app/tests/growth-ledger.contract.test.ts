import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { autoGeoProviderStatus, canonicalGrowthWebsite, pairedTrainingEligibility } from '../server/growth/ledger'

describe('Growth Experiment Ledger governance contract', () => {
  const eligibleInput = {
    hasGrantedConsent: true,
    consentRevoked: false,
    intakeStatus: 'approved' as const,
    experimentStatus: 'approved' as const,
    hasControlVariant: true,
    hasCandidateVariant: true,
    controlFactualityPassed: true,
    candidateFactualityPassed: true,
    controlQualityPassed: true,
    candidateQualityPassed: true,
    hasRealMeasurement: true,
    hasCompleteLineage: true,
    autoPublish: false,
    review: { decision: 'approved' as const, factualityDecision: 'passed' as const, brandQualityDecision: 'passed' as const, approvedForDataset: true },
  }

  it('canonicalizes only public HTTP(S) websites', () => {
    expect(canonicalGrowthWebsite('https://Example.com/path#fragment')).toEqual({ canonicalWebsiteUrl: 'https://example.com/path', domain: 'example.com' })
    expect(() => canonicalGrowthWebsite('mailto:owner@example.com')).toThrow()
    expect(() => canonicalGrowthWebsite('not a URL')).toThrow()
    expect(() => canonicalGrowthWebsite('https://owner:secret@example.com')).toThrow()
  })

  it('fails closed until consent, paired variants, measurement, lineage and human review all pass', () => {
    expect(pairedTrainingEligibility({ ...eligibleInput, hasGrantedConsent: false }).reasons).toContain('CONSENT_MISSING')
    expect(pairedTrainingEligibility({ ...eligibleInput, consentRevoked: true }).reasons).toContain('CONSENT_REVOKED')
    expect(pairedTrainingEligibility({ ...eligibleInput, hasControlVariant: false }).reasons).toContain('VARIANT_MISSING')
    expect(pairedTrainingEligibility({ ...eligibleInput, hasRealMeasurement: false }).reasons).toContain('MEASUREMENT_MISSING')
    expect(pairedTrainingEligibility({ ...eligibleInput, candidateFactualityPassed: false }).reasons).toContain('FACTUALITY_NOT_PASSED')
    expect(pairedTrainingEligibility({ ...eligibleInput, candidateQualityPassed: false }).reasons).toContain('QUALITY_NOT_PASSED')
    expect(pairedTrainingEligibility({ ...eligibleInput, hasCompleteLineage: false }).reasons).toContain('LINEAGE_INCOMPLETE')
    expect(pairedTrainingEligibility({ ...eligibleInput, autoPublish: true }).reasons).toContain('AUTO_PUBLISH_ENABLED')
    expect(pairedTrainingEligibility({ ...eligibleInput, review: { ...eligibleInput.review, decision: 'needs_revision' } }).reasons).toContain('HUMAN_REVIEW_REQUIRED')
    expect(pairedTrainingEligibility(eligibleInput)).toEqual({ eligible: true, reasons: [] })
  })

  it('keeps the provider blocked and auto-publish disabled by default', () => {
    expect(autoGeoProviderStatus).toMatchObject({ status: 'blocked', providerConfigured: false, modelLoaded: false, liveApiApproved: false, autoPublishEnabled: false })
  })

  it('keeps research consent independent and optional in every required lead form', () => {
    for (const relativePath of ['pages/index.vue', 'components/landing/AutomaticSiteAnalysis.vue', 'components/lead/FitReviewForm.vue']) {
      const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
      expect(source).toMatch(/growthResearch(?:Consent)?: false/)
      expect(source).toContain('growthResearch')
    }
  })

  it('marks Growth Lab as noindex and defers all data reads to owner API', () => {
    const source = readFileSync(new URL('../pages/growth-lab.vue', import.meta.url), 'utf8')
    const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
    expect(source).toContain('noindex, nofollow, noarchive')
    expect(source).toContain("/api/growth/overview")
    expect(config).toContain("'/en/growth-lab': { prerender: false")
    expect(config).toContain("'/zh-hant/growth-lab': { prerender: false")
  })

  it('keeps the unapplied migration aligned with every governed ledger table', () => {
    const schema = readFileSync(new URL('../server/database/schema.ts', import.meta.url), 'utf8')
    const migration = readFileSync(new URL('../server/database/migrations/0008_governed_growth_ledger.sql', import.meta.url), 'utf8')
    for (const table of ['growthResearchConsents', 'growthResearchIntakes', 'growthExperiments', 'growthExperimentVariants', 'growthMeasurements', 'growthExperimentReviews']) {
      expect(schema).toContain(table)
      expect(migration).toContain(table)
    }
    expect(migration).toContain('growth_variant_experiment_fk')
    expect(migration).toContain('growth_intake_consent_fk')
    expect(migration).toContain('growth_consent_lead_idx')
    const journal = JSON.parse(readFileSync(new URL('../server/database/migrations/meta/_journal.json', import.meta.url), 'utf8'))
    expect(journal.entries.at(-1)?.tag).toBe('0008_governed_growth_ledger')
    expect(readFileSync(new URL('../server/database/migrations/meta/0008_snapshot.json', import.meta.url), 'utf8')).toContain('growthExperimentVariants')
  })

  it('provides an owner-only path to finish factuality and quality review for each variant', () => {
    const source = readFileSync(new URL('../server/api/growth/experiments/[id]/variants/[variantId]/review.post.ts', import.meta.url), 'utf8')
    expect(source).toContain('requireOwner(event)')
    expect(source).toContain('factualityStatus')
    expect(source).toContain('qualityStatus')
    expect(source).toContain('growthExperimentVariants.experimentId')
  })

  it('keeps consent creation and revocation atomic with their dependent records', () => {
    const leadStore = readFileSync(new URL('../server/utils/lead.ts', import.meta.url), 'utf8')
    const ledger = readFileSync(new URL('../server/growth/ledger.ts', import.meta.url), 'utf8')
    expect(leadStore).toContain('database.transaction')
    expect(ledger).toContain('database.transaction')
    expect(ledger).toContain('growthResearchConsent: false')
  })
})
