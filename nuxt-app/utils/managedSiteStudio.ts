import type { FunnelAnswersView } from './managedSiteFunnel'
import type { StudioDesign } from './managedSitePresentation'

export type StudioPreset = 'atelier' | 'bloom' | 'alignment'
export type StudioBrief = {
  brandName: string
  brief: string
  /** Explicit website language wins over the language of a later edit request. */
  language?: string
  audience?: string
  market?: string
  /** Server-derived from the token-bound intake, never arbitrary HTML or CSS. */
  guidedRevision?: number
  siteType: 'one_page' | 'brand_blog' | 'simple_commerce'
  goal:
    | 'increase_inquiries'
    | 'increase_bookings'
    | 'sell_online'
    | 'build_brand'
}
export type StudioPageKey =
  | 'home'
  | 'about'
  | 'services'
  | 'faq'
  | 'contact'
  | 'blog'
  | 'shop'
/** Public copy only. This is never publication, session, price, or provider authority. */
export type StudioCopy = {
  schemaVersion: 'managed-site-preview-copy-v1'
  navigation: { route: string; label: string }[]
  pages: { pageKey: StudioPageKey; title: string; description: string }[]
  sections: { sectionId: string; heading: string; body: string }[]
  faq: { question: string; answer: string }[]
  summaryAnswer: string
}
export type StudioStrategy = {
  source: 'llm' | 'outline'
  audience: string
  proposition: string
  primaryAction: string
  journey: { pageKey: StudioPageKey; label: string; purpose: string }[]
  facts: string[]
  questions: string[]
  recommendedPreset: StudioPreset
  designReason: string
}
export type StudioPreviewRequest = StudioBrief & {
  mode: 'template' | 'ai'
  revision?: { instruction: string; base: StudioCopy; proposalId?: string; pageKey?: StudioPageKey }
}
export type StudioChange = {
  key: string
  label: string
  before: string
  after: string
}
export type StudioPreview = {
  /** Opaque server-stored proposal identity; not publication or payment authority. */
  proposalId?: string
  language?: string
  design?: StudioDesign
  deliveryReview?: { layoutOnly: boolean; missingHeroImage: boolean; unactivatedModules: string[]; viewportReviewRequired: true; referencePixelMatchVerified: false }
  source: 'llm' | 'template'
  sourceReason: string
  generatedAt: string
  headline: string
  sections: { heading: string; body: string }[]
  designs: { preset: StudioPreset; html: string }[]
  // Optional for compatibility with an older API during a rolling release.
  strategy?: StudioStrategy
  pages?: {
    key: StudioPageKey
    label: string
    designs: { preset: StudioPreset; html: string }[]
  }[]
  editContext?: StudioCopy
  changes?: StudioChange[]
}
export type StudioSelection = {
  brief: StudioBrief
  preset: StudioPreset
  preview: StudioPreview
}

export const STUDIO_DIRECTIONS = [
  {
    key: 'atelier',
    label: '編輯精品',
    note: '米白・酒紅・錯落留白',
    style: 'premium',
  },
  {
    key: 'bloom',
    label: '自然親近',
    note: '霧綠・圓角・置中構圖',
    style: 'warm',
  },
  {
    key: 'alignment',
    label: '俐落科技',
    note: '深藍・薄荷綠・幾何線條',
    style: 'tech',
  },
] as const

export function studioBriefKey(brief: StudioBrief): string {
  return JSON.stringify([
    brief.brandName.trim(),
    brief.brief.trim(),
    brief.siteType,
    brief.goal,
    brief.language || null,
    brief.audience || null,
    brief.market || null,
    brief.guidedRevision ?? null,
  ])
}

/** No contact identity, prices, consent, domain, or payment authority is invented here. */
/** A promised customer action must select its actual module, not just change the CTA wording. */
export function studioRequiredModules(brief: Pick<StudioBrief, 'siteType' | 'goal'>): Array<'contact_lead_capture' | 'shopify_commerce' | 'google_booking_assisted_integration'> {
  const modules: ReturnType<typeof studioRequiredModules> = []
  if (brief.siteType === 'simple_commerce' || brief.goal === 'sell_online') modules.push('shopify_commerce')
  if (brief.goal === 'increase_bookings') modules.push('google_booking_assisted_integration')
  if (brief.goal === 'increase_inquiries') modules.push('contact_lead_capture')
  return modules
}

export function studioAnswers(
  brief: StudioBrief,
  preset: StudioPreset
): Partial<FunnelAnswersView> {
  return {
    company: {
      brandName: brief.brandName.trim(),
      whatWeDo: brief.brief.trim(),
      mainOffer: brief.brief.trim().slice(0, 1000),
      feelings: [],
      conversionGoals: [brief.goal],
      ...(brief.language ? { language: brief.language } : {}),
    },
    style: {
      referenceUrls: [],
      stylePreset: STUDIO_DIRECTIONS.find(item => item.key === preset)!.style,
      customerSitePreset: preset,
      designTier: 'template',
    },
    siteType: brief.siteType,
  }
}
