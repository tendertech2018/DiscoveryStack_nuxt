import { request as httpsRequest } from 'node:https'
import { lookup } from 'node:dns/promises'
import { createError } from 'h3'
import { assertSafeAuditTarget } from '../../audit/targetGuard'
import { isPublicIpAddress } from '../../utils/publicSiteAnalysis'
import { DEFAULT_STUDIO_DESIGN, legibleInk, type StudioDesignTuning } from '../../../utils/managedSitePresentation'
import type { StudioReference } from '../../../utils/managedSiteGuided'

type ReferenceResource = { status: number; type: string; body: string; url: string }
export type ReferenceFetch = (url: string, maxBytes: number, deadline: number, allowedUrl?: (url: string) => boolean) => Promise<ReferenceResource>

/** Conservative robots matching, including wildcard/end rules; no permissive fallback on malformed paths. */
export function referenceRobotsAllowsPath(content: string, pathname: string): boolean {
  const rules: Array<{ agents: string[]; allow: boolean; path: string }> = []
  let agents: string[] = [], hasRules = false
  for (const raw of content.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, '').trim(), separator = line.indexOf(':')
    if (separator < 0) continue
    const field = line.slice(0, separator).trim().toLowerCase(), value = line.slice(separator + 1).trim()
    if (field === 'user-agent') {
      if (hasRules) { agents = []; hasRules = false }
      agents.push(value.toLowerCase())
    } else if (['allow', 'disallow'].includes(field) && agents.length) {
      hasRules = true
      if (value) rules.push({ agents: [...agents], allow: field === 'allow', path: value })
    }
  }
  const normal = (path: string) => decodeURI(path).replace(/%[a-f0-9]{2}/giu, escape => escape.toUpperCase())
  try {
    const target = normal(pathname)
    const matches = rules.filter(rule => rule.agents.some(agent => agent === '*' || 'discoverystack-stylereference'.includes(agent))).filter(rule => {
      const path = normal(rule.path), atEnd = path.endsWith('$')
      const parts = (atEnd ? path.slice(0, -1) : path).split('*')
      if (!target.startsWith(parts[0]!)) return false
      if (parts.length === 1) return !atEnd || target === parts[0]
      let position = parts[0]!.length
      for (let index = 1; index < parts.length; index++) {
        const part = parts[index]!
        if (atEnd && index === parts.length - 1) return target.endsWith(part) && target.length - part.length >= position
        const found = target.indexOf(part, position)
        if (found < 0) return false
        position = found + part.length
      }
      return true
    }).sort((a, b) => b.path.replace(/[*$]/gu, '').length - a.path.replace(/[*$]/gu, '').length || Number(b.allow) - Number(a.allow))
    return matches[0]?.allow ?? true
  } catch { return false }
}

export function studioReferenceUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2048) throw createError({ statusCode: 422, statusMessage: 'A public HTTPS reference URL is required.' })
  try {
    const safe = assertSafeAuditTarget(raw)
    const url = new URL(safe.normalizedUrl)
    if (url.protocol !== 'https:' || url.search || url.hash || (url.port && url.port !== '443')) throw new Error('unsafe')
    return url.toString()
  } catch { throw createError({ statusCode: 422, statusMessage: 'Use a public HTTPS page without login tokens, query parameters or private addresses.' }) }
}

/** GET only. DNS is pinned to a verified public address for the actual socket, including redirects. */
export const fetchStudioReferenceResource: ReferenceFetch = async (raw, maxBytes, deadline, allowedUrl) => {
  let current = studioReferenceUrl(raw)
  for (let hop = 0; hop <= 3; hop++) {
    const url = new URL(current)
    if (allowedUrl && !allowedUrl(current)) throw new Error('reference_disallowed_redirect')
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('reference_timeout')
    let lookupTimer: ReturnType<typeof setTimeout> | undefined
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { lookupTimer = setTimeout(() => reject(new Error('reference_timeout')), remaining); lookupTimer.unref() }),
    ]).finally(() => clearTimeout(lookupTimer))
    if (!addresses.length || addresses.some(item => !isPublicIpAddress(item.address))) throw new Error('reference_private_address')
    const address = addresses.find(item => item.family === 4) || addresses[0]!
    const response = await new Promise<ReferenceResource & { location?: string }>((resolve, reject) => {
      const req = httpsRequest(url, {
        method: 'GET', agent: false,
        lookup: (_hostname, options, callback: any) => (options as any)?.all ? callback(null, [address]) : callback(null, address.address, address.family),
        headers: { accept: 'text/html,text/css,text/plain', 'accept-encoding': 'identity', 'user-agent': 'DiscoveryStack-StyleReference/1.0 (customer-requested design characteristics only)' },
      }, res => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400) { res.resume(); resolve({ status, type: '', body: '', url: current, location: res.headers.location }); return }
        const type = String(res.headers['content-type'] || '').split(';')[0]!.toLowerCase()
        if (!['text/html', 'text/css', 'text/plain'].includes(type) && status !== 404 && status !== 410) { res.destroy(); reject(new Error('reference_content_type')); return }
        if (Number(res.headers['content-length'] || 0) > maxBytes) { res.destroy(); reject(new Error('reference_too_large')); return }
        const chunks: Buffer[] = []; let bytes = 0
        res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) { res.destroy(); reject(new Error('reference_too_large')) } else chunks.push(chunk) })
        res.on('end', () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8'), url: current }))
        res.on('error', reject)
      })
      const timer = setTimeout(() => req.destroy(new Error('reference_timeout')), Math.max(1, deadline - Date.now()))
      req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end()
    })
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || hop === 3) throw new Error('reference_redirect_limit')
      current = studioReferenceUrl(new URL(response.location, current).toString())
      continue
    }
    return response
  }
  throw new Error('reference_redirect_limit')
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu'))
  return match ? match[1] || match[2] || '' : null
}

/** Resolve only small literal CSS tokens, never imports, functions, scripts or a computed DOM. */
export function normaliseStudioReferenceCss(source: string): string {
  const bounded = source.slice(0, 700_000).replace(/\/\*[\s\S]*?\*\//gu, '')
  const tokens = new Map<string, string>()
  for (const match of bounded.matchAll(/(--[a-z0-9_-]{1,80})\s*:\s*([^;{}]{1,300})[;}]/giu)) {
    if (tokens.size >= 256) break
    tokens.set(match[1]!, match[2]!.trim())
  }
  let css = bounded
  for (let pass = 0; pass < 4; pass++) {
    let remaining = Math.max(0, 1_000_000 - css.length)
    css = css.replace(/var\(\s*(--[a-z0-9_-]{1,80})\s*(?:,\s*([^()]{1,120}))?\)/giu, (all, name, fallback) => {
      const resolved = tokens.get(name) || fallback || ''
      const extra = Math.max(0, resolved.length - all.length)
      if (extra > remaining) return ''
      remaining -= extra
      return resolved
    })
  }
  return css.slice(0, 1_000_000)
    .replace(/#([0-9a-f]{3})(?=[\s;,)}!]|$)/giu, (_all, raw: string) => '#' + [...raw].map(char => char + char).join(''))
    .replace(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*1(?:\.0*)?)?\s*\)/giu, (all, r, g, b) => {
      const channels = [r, g, b].map(Number)
      return channels.every(value => value <= 255) ? '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('') : all
    })
}

/** Read only bounded design characteristics, not arbitrary selectors or executable CSS. */
export function extractStudioDesignTuning(css: string): StudioDesignTuning {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]{0,8000})\}/gu)]
  const find = (selector: RegExp) => blocks.filter(match => selector.test(match[1]!)).map(match => match[2]).join(';')
  const heading = find(/(?:\bh1\b|hero[^,{}]*title|headline)/iu)
  const hero = find(/(?:hero|banner|masthead)/iu)
  const button = find(/(?:\bbutton\b|\.btn\b|\.cta\b)/iu)
  const header = find(/(?:\bheader\b|\bnav\b|\.navbar\b)/iu)
  const radius = Number((hero || button).match(/border-radius\s*:\s*(\d+(?:\.\d+)?)px/iu)?.[1] || 0)
  const ratio = hero.match(/aspect-ratio\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/iu)
  const imageRatio = ratio ? Number(ratio[1]) / Number(ratio[2]) : 0
  const headingWeight = Number(heading.match(/font-weight\s*:\s*([4-7]00)/iu)?.[1] || 400) as StudioDesignTuning['headingWeight']
  const spacingMatch = hero.match(/(?:padding(?:-block|-top)?|gap)\s*:\s*(\d+(?:\.\d+)?)(px|rem)/iu)
  const spacing = spacingMatch ? Number(spacingMatch[1]) * (spacingMatch[2]?.toLowerCase() === 'rem' ? 16 : 1) : 64
  return { density: spacing >= 72 ? 'airy' : spacing <= 32 ? 'compact' : 'balanced', corners: radius >= 24 ? 'round' : radius >= 4 ? 'soft' : 'square', imageRatio: imageRatio >= 2 ? 'wide' : imageRatio >= 1.25 ? 'landscape' : imageRatio >= .9 ? 'square' : 'portrait', headingWeight, navigation: /position\s*:\s*(?:sticky|fixed)/iu.test(header) ? 'sticky' : 'static', button: /background(?:-color)?\s*:\s*(?!none|transparent)[#a-z]/iu.test(button) ? 'solid' : /border(?:-width)?\s*:\s*[1-9]/iu.test(button) ? 'outline' : 'underline' }
}

/** Raw third-party code, copy, images and URLs are never passed to the model or rendered in our site. */
export function extractStudioReference(url: string, html: string, styles: string[], complete: boolean, clock = new Date()): StudioReference {
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/giu)].map(match => match[1]!).join('\n')
  const css = normaliseStudioReferenceCss(`${inline}\n${styles.join('\n')}`)
  const counts = new Map<string, number>()
  for (const match of css.matchAll(/(?:^|[\s:,(])#([0-9a-f]{6}|[0-9a-f]{3})(?=[\s;,)}!]|$)/giu)) {
    const raw = match[1]!.toLowerCase(); const color = `#${raw.length === 3 ? [...raw].map(char => char + char).join('') : raw}`
    counts.set(color, (counts.get(color) || 0) + 1)
  }
  const palette = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([color]) => color)
  const fonts = [...new Set([...css.matchAll(/font-family\s*:\s*([^;}]+)/giu)].flatMap(match => match[1]!.split(',')).map(font => font.trim().replace(/^["']|["']$/gu, '')).filter(font => /^[\p{L}\p{N} _-]{1,70}$/u.test(font)))].slice(0, 8)
  const signals = { imageCount: (html.match(/<img\b/giu) || []).length, sectionCount: (html.match(/<section\b/giu) || []).length, hasGrid: /display\s*:\s*grid/iu.test(css), hasSticky: /position\s*:\s*sticky/iu.test(css), hasCssAnimation: /@keyframes|animation(?:-name)?\s*:/iu.test(css) }
  // Prefer the canvas role rather than the first incidental button/card background in a stylesheet.
  const canvasRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].filter(match => match[1]!.split(',').every(selector => /^(?:html|body|:root)$/iu.test(selector.trim()))).map(match => match[2]).join(';')
  const background = (canvasRules || css).match(/(?:background-color|background)\s*:\s*(#[0-9a-f]{6})(?=[\s;!}]|$)/iu)?.[1]?.toLowerCase() || DEFAULT_STUDIO_DESIGN.canvas
  const chromatic = palette.find(color => Math.max(...[1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))) - Math.min(...[1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))) > 35)
  const heroRules = [...css.matchAll(/([^{}]*(?:hero|masthead|banner)[^{}]*)\{([^{}]*)\}/giu)].map(match => match[2]).join(';')
  const splitHero = /grid-template-columns\s*:[^;]*(?:\bfr\b|\dfr|minmax)/iu.test(heroRules) && !/grid-template-columns\s*:\s*1fr\s*(?:;|$)/iu.test(heroRules)
  const wideHero = /(?:aspect-ratio\s*:\s*(?:16\s*\/\s*9|21\s*\/\s*9)|(?:width|max-width)\s*:\s*100vw)/iu.test(heroRules)
  const preferredInk = canvasRules.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{6})/iu)?.[1]
  return {
    version: 'studio-reference-v1', url, analysedAt: clock.toISOString(), status: complete && css.trim() ? 'analysed' : 'partial', palette, fonts, signals,
    design: { ...DEFAULT_STUDIO_DESIGN, canvas: background, surface: background, ink: legibleInk(background, preferredInk), accent: chromatic || DEFAULT_STUDIO_DESIGN.accent, typography: fonts.some(font => /serif|georgia|didot|baskerville|bodoni|cormorant|playfair/iu.test(font) && !/sans/iu.test(font)) ? 'serif' : 'sans', layout: splitHero ? 'editorial' : wideHero || signals.imageCount >= 5 ? 'showcase' : signals.hasGrid ? 'editorial' : 'structured', motion: signals.hasCssAnimation ? 'reveal' : 'none', tuning: extractStudioDesignTuning(css) },
    limitations: ['PUBLIC_HTML_AND_CSS_SIGNALS_NOT_RENDERED_PIXEL_COMPARISON', 'NO_SOURCE_COPY_LOGOS_IMAGES_OR_FONT_FILES_IMPORTED', 'CUSTOM_FONTS_REQUIRE_A_LICENSED_ASSET', 'JAVASCRIPT_ANIMATIONS_NOT_EXECUTED', ...(!complete ? ['SOME_STYLES_UNAVAILABLE'] : [])],
  }
}

export async function analyseStudioReference(raw: unknown, dependencies: { fetchResource?: ReferenceFetch; clock?: () => Date } = {}): Promise<StudioReference> {
  const url = studioReferenceUrl(raw), resource = dependencies.fetchResource || fetchStudioReferenceResource
  const deadline = Date.now() + 15_000
  try {
    const sameOrigin = (target: string) => new URL(target).origin === new URL(url).origin
    const robots = await resource(new URL('/robots.txt', url).toString(), 64_000, deadline, sameOrigin)
    if (new URL(robots.url).origin !== new URL(url).origin) throw new Error('reference_cross_origin_robots')
    const noRobots = [404, 410].includes(robots.status)
    const allowed = (target: string) => sameOrigin(target) && (noRobots || referenceRobotsAllowsPath(robots.body, new URL(target).pathname))
    if (!noRobots && robots.status !== 200 || !allowed(url)) throw new Error('reference_not_allowed')
    const page = await resource(url, 350_000, deadline, allowed)
    if (page.status !== 200 || page.type !== 'text/html') throw new Error('reference_unavailable')
    if (!allowed(page.url)) throw new Error('reference_disallowed_redirect')
    const styles: string[] = []
    const links = [...page.body.matchAll(/<link\b[^>]*>/giu)].map(match => match[0]).filter(tag => /\bstylesheet\b/iu.test(attr(tag, 'rel') || ''))
    let complete = links.length <= 4
    for (const tag of links.slice(0, 4)) {
      try {
        const href = attr(tag, 'href'); if (!href) continue
        const cssUrl = new URL(href, page.url)
        if (cssUrl.origin !== new URL(url).origin) { complete = false; continue }
        // Cache-busting queries are not forwarded; never follow third-party imports or url().
        cssUrl.search = ''; cssUrl.hash = ''
        if (!allowed(cssUrl.toString())) { complete = false; continue }
        const result = await resource(cssUrl.toString(), 140_000, deadline, allowed)
        if (result.status === 200 && result.type === 'text/css' && allowed(result.url)) styles.push(result.body)
        else complete = false
      } catch { complete = false }
    }
    return extractStudioReference(page.url, page.body, styles, complete, dependencies.clock?.() || new Date())
  } catch { throw createError({ statusCode: 422, statusMessage: 'This reference could not be analysed safely. Try another public page; your existing brief is unchanged.', data: { code: 'STUDIO_REFERENCE_UNAVAILABLE' } }) }
}
