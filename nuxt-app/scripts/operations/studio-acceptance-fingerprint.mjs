import { createHash } from 'node:crypto'

/** JSON object property order is not semantic; TiDB can reorder persisted keys. */
export function studioAcceptanceFingerprint(value) {
  const canonical = JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item)
  return createHash('sha256').update(canonical).digest('hex')
}

export function studioAcceptanceLanguage(value) {
  if (typeof value !== 'string' || !value) return null
  try { return new Intl.Locale(value).baseName } catch { return null }
}
