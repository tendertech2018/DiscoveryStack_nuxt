import type { StudioBrief } from './managedSiteStudio'
import type { StudioDesign, StudioMedia } from './managedSitePresentation'

export const INTAKE_FIELDS = ['brandName', 'offer', 'audience', 'market', 'goal', 'siteType', 'language', 'style'] as const
export type IntakeField = typeof INTAKE_FIELDS[number]
export type IntakeFacts = Partial<Record<IntakeField, string>>
export const REQUIRED_INTAKE_FIELDS: IntakeField[] = ['brandName', 'offer', 'audience', 'goal']
export type StudioReference = {
  version: 'studio-reference-v1'
  url: string
  analysedAt: string
  status: 'analysed' | 'partial'
  palette: string[]
  fonts: string[]
  signals: { imageCount: number; sectionCount: number; hasGrid: boolean; hasSticky: boolean; hasCssAnimation: boolean }
  design: StudioDesign
  limitations: string[]
}
export type StudioIntakeState = {
  version: 'studio-intake-v1'
  revision: number
  language: string
  facts: IntakeFacts
  messages: string[]
  reference?: StudioReference
  media?: StudioMedia[]
  dialogue?: { reply: string; questions: { field: IntakeField; prompt: string }[] }
}
export type StudioIntakeReply = {
  revision: number
  language: string
  status: 'questions' | 'ready' | 'off_topic'
  reply: string
  facts: IntakeFacts
  questions: { field: IntakeField; prompt: string }[]
  reference?: StudioReference
  media?: StudioMedia[]
  brief?: StudioBrief
  providerUsed: boolean
}

/** Obvious abuse is rejected without a paid call. Ambiguous requests are classified by the bounded model. */
export function clearlyUnrelatedStudioRequest(text: string): boolean {
  return /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|system|developer)\s+(?:instructions?|prompts?)|(?:show|reveal|print)\s+(?:your\s+)?(?:api.?key|system prompt|password)|(?:洩漏|顯示|給我|印出).{0,8}(?:金鑰|系統提示|密碼)/iu.test(text) || (!/website|page|brand|store|product|copy|site|網站|網頁|品牌|商店|商品|文案|ページ|サイト|ショップ/iu.test(text) && /write (?:me )?a love (?:letter|poem)|tell (?:me )?a joke|what(?:'s| is) the weather|寫.{0,3}情書|講.{0,3}笑話|今天天氣|幫我寫作業/iu.test(text))
}
