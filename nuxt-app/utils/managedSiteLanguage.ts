/** BCP-47 language identity, independent of owner UI, billing currency and market. */
export function normalizeSiteLanguage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 35 || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/iu.test(value)) return null
  try {
    const locale = new Intl.Locale(value)
    if (locale.language === 'und') return null
    const tag = locale.baseName
    if (tag === 'zh' || tag === 'zh-TW' || tag === 'zh-HK' || tag === 'zh-Hant') return 'zh-hant'
    if (tag === 'zh-CN' || tag === 'zh-SG' || tag === 'zh-Hans') return 'zh-hans'
    return tag
  } catch { return null }
}

export function htmlSiteLanguage(value: string): string {
  const normalized = normalizeSiteLanguage(value)
  if (!normalized) throw new Error('Invalid site language')
  return new Intl.Locale(normalized).baseName
}

export function siteTextDirection(value: string): 'ltr' | 'rtl' {
  const locale = new Intl.Locale(htmlSiteLanguage(value)).maximize()
  return ['Arab', 'Hebr', 'Thaa', 'Nkoo', 'Adlm', 'Rohg', 'Syrc'].includes(locale.script || '') ? 'rtl' : 'ltr'
}

/** Only an initial UI hint. The model identifies the request language; an explicit choice wins. */
export function initialStudioLanguage(text: string, fallback = 'en'): string {
  if (/[\u3040-\u30ff]/u.test(text)) return 'ja'
  if (/[\uac00-\ud7af]/u.test(text)) return 'ko'
  if (/[\u0600-\u06ff]/u.test(text)) return 'ar'
  if (/[\u4e00-\u9fff]/u.test(text)) return /[这简网页产为们请]/u.test(text) ? 'zh-hans' : 'zh-hant'
  if (/[\u0400-\u04ff]/u.test(text)) return 'ru'
  return normalizeSiteLanguage(fallback) || 'en'
}
