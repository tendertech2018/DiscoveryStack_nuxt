// Charge units, not bank-payout units. No exchange rates or silent conversions.
export const CURRENCIES = Object.freeze({ TWD: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, KRW: 0, VND: 0, HKD: 2, SGD: 2, AUD: 2, CAD: 2, NZD: 2, CHF: 2, CNY: 2, THB: 2, MYR: 2, PHP: 2, INR: 2, IDR: 2, AED: 2, SAR: 2, BRL: 2, MXN: 2 })
export function normalizeLocale(value = 'zh-Hant') {
  if (typeof value !== 'string' || value.length > 50) throw new Error('INVALID_LOCALE')
  const locale = new Intl.Locale(value).baseName
  return locale === 'zh' ? 'zh-Hant' : locale
}
export function normalizeCurrency(value = 'TWD') {
  if (typeof value !== 'string' || !Object.hasOwn(CURRENCIES, value)) throw new Error('UNSUPPORTED_CURRENCY')
  return value
}
export function formatMoney(minor, currency = 'TWD', locale = 'zh-Hant') {
  normalizeCurrency(currency)
  if (!Number.isSafeInteger(minor)) throw new Error('INVALID_MONEY')
  const digits = CURRENCIES[currency]
  return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits)
}
export function direction(locale) { return ['Arab', 'Hebr', 'Thaa', 'Nkoo', 'Adlm'].includes(new Intl.Locale(locale).maximize().script) ? 'rtl' : 'ltr' }
export function customerLanguageSupported(locale) {
  const parsed = new Intl.Locale(normalizeLocale(locale)).maximize()
  return parsed.language === 'zh' ? parsed.script === 'Hant' : ['en', 'ja', 'fr', 'es', 'ar'].includes(parsed.language)
}
export function legibleInk(background, preferred = '#282421') {
  const luminance = hex => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  return ratio(background, preferred) >= 4.5 ? preferred : ratio(background, '#111111') >= ratio(background, '#ffffff') ? '#111111' : '#ffffff'
}
export function customerError(status, locale) {
  const lang = normalizeLocale(locale).split('-')[0]
  const copy = {
    en: ['Please check the form and try again.', 'This item changed or is no longer available. Refresh and try again.', 'This service is not ready. Please contact the merchant.'],
    zh: ['請檢查填寫資料後重試。', '資料已變更或目前無法使用，請更新後重試。', '此服務尚未準備完成，請聯絡商家。'],
    ja: ['入力内容を確認して再試行してください。', '内容が変更されたか、利用できなくなりました。更新して再試行してください。', 'このサービスは準備中です。店舗へお問い合わせください。'],
    fr: ['Vérifiez le formulaire et réessayez.', 'Cet élément a changé ou est indisponible. Actualisez et réessayez.', 'Ce service n’est pas prêt. Contactez le commerçant.'],
    es: ['Revisa el formulario e inténtalo de nuevo.', 'Este elemento ha cambiado o no está disponible. Actualiza e inténtalo de nuevo.', 'Este servicio no está listo. Contacta al comercio.'],
    ar: ['يرجى مراجعة النموذج والمحاولة مجددًا.', 'تغير هذا العنصر أو لم يعد متاحًا. حدّث الصفحة وحاول مجددًا.', 'هذه الخدمة غير جاهزة. يرجى التواصل مع التاجر.'],
  }
  return (copy[lang] || copy.en)[status === 409 ? 1 : status >= 500 ? 2 : 0]
}

// Translate only code-owned literals, never interpolated customer copy or names.
import { messages } from './messages.mjs'
export function createTranslator(locale = 'zh-Hant') {
  const language = normalizeLocale(locale)
  const selected = /^zh(?:-Hant|-TW|-HK|-MO|$)/iu.test(language) ? 'zh-Hant' : language.split('-')[0]
  const pack = messages[selected] || messages.en
  const keys = Object.keys(messages.en).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu')
  const literal = value => selected === 'zh-Hant' ? String(value) : String(value).replace(pattern, key => pack[key] ?? messages.en[key])
  return (value, ...parts) => Array.isArray(value) && value.raw ? value.reduce((result, part, index) => result + literal(part) + (index < parts.length ? parts[index] : ''), '') : literal(value)
}
