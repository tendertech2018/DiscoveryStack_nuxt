import { createHash } from 'node:crypto'
import { normalizePublicHttpsOrigin } from '../content-operations/normalization'
import { htmlSiteLanguage } from '../../utils/managedSiteLanguage'
import type { ManagedSiteBlueprintV1 } from './live-connectors/types'

export const PUBLIC_KNOWLEDGE_VERSION = 'managed-site-public-knowledge-v1'
const MAX_KNOWLEDGE_BYTES = 8 * 1024 * 1024
export type PublicKnowledgeAsset = { path: string; contentType: string; content: string }

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
// Project only public, rendered fields. Never serialize the blueprint, its evidence,
// module configuration, contact endpoint, image bytes or provider provenance.
function markdown(value: string): string {
  if (typeof value !== 'string' || value.length > 200_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new Error('Invalid public knowledge text.')
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/([\\`*_{}\[\]()#+.!|~-])/gu, '\\$1')
}

function decodeHtml(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39);/gu, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" })[entity]!)
}

/** A projection of our own escaped renderer output, never a general web scraper. */
function publishedPage(asset: PublicKnowledgeAsset, origin: string, locale: string) {
  if (!asset.contentType.startsWith('text/html')) return null
  if (/<meta\s+name="robots"\s+content="[^"]*(?:noindex|nosnippet)/iu.test(asset.content)) return null
  const route = asset.path === 'index.html' ? '/' : `/${asset.path.replace(/\/index\.html$/u, '')}`
  if (!/^(?:index\.html|[a-z0-9][a-z0-9/_-]*\/index\.html)$/u.test(asset.path) || route.includes('//') || asset.content.length > 2_000_000) throw new Error('Invalid rendered knowledge page.')
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/iu.exec(asset.content)?.[1]
  if (main === undefined) throw new Error('Rendered knowledge page has no main content.')
  const plain = (value: string) => decodeHtml(value.replace(/<!--[\s\S]*?-->/gu, '').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/giu, '').replace(/<\/(?:h[1-6]|p|section|article|li|summary|details|label|div)>/giu, '\n').replace(/<[^>]*>/gu, '')).replace(/[ \t]+/gu, ' ').replace(/\n\s*\n+/gu, '\n\n').trim()
  const title = plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu.exec(main)?.[1] || /<title>([\s\S]*?)<\/title>/iu.exec(asset.content)?.[1] || '')
  const description = decodeHtml(/<meta\s+name="description"\s+content="([^"]*)"/iu.exec(asset.content)?.[1] || '')
  const language = htmlSiteLanguage(/<html\b[^>]*\blang="([^"]+)"/iu.exec(asset.content)?.[1] || locale)
  const url = `${origin}${route}`
  const body = `# ${markdown(title)}\n\nSource: ${url}\n\n${markdown(plain(main))}\n`
  return { url, title, description, language, body, contentHash: digest(body) }
}

export function managedSitePublicOrganization(blueprint: ManagedSiteBlueprintV1, origin: string) {
  return { '@type': 'Organization', '@id': `${origin}/#organization`, name: blueprint.seoGeo.organizationName, url: origin }
}

/** Called by the release renderer, after immutable artifact admission. No model or I/O. */
export function renderManagedSitePublicKnowledge(blueprint: ManagedSiteBlueprintV1, canonicalOrigin: string, renderedAssets?: readonly PublicKnowledgeAsset[]): PublicKnowledgeAsset[] {
  const origin = normalizePublicHttpsOrigin(canonicalOrigin)
  if (!Array.isArray(blueprint.pages) || blueprint.pages.length < 1 || blueprint.pages.length > 50 || !Array.isArray(blueprint.faq) || blueprint.faq.length > 20) throw new Error('Invalid public knowledge page bounds.')
  const seen = new Set<string>()
  let pages = blueprint.pages.map(page => {
    if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/u.test(page.route) || seen.has(page.route)) throw new Error('Invalid or duplicate public knowledge route.')
    seen.add(page.route)
    if (!Array.isArray(page.sections) || page.sections.length > 100) throw new Error('Invalid public knowledge section bounds.')
    const url = `${origin}${page.route}`
    const visibleFaq = page.pageKey === 'faq' || page.sections.some(section => section.kind === 'faq') ? blueprint.faq : []
    const body = [
      `# ${markdown(page.title)}`, `Source: ${url}`, markdown(page.description),
      ...page.sections.flatMap(section => [`## ${markdown(section.heading)}`, markdown(section.body)]),
      ...visibleFaq.flatMap(item => [`## ${markdown(item.question)}`, markdown(item.answer)]),
    ].join('\n\n') + '\n'
    return { url, title: page.title, description: page.description, language: htmlSiteLanguage(blueprint.locale), body, contentHash: digest(body) }
  })
  if (renderedAssets) {
    if (renderedAssets.length > 1100) throw new Error('Too many public knowledge assets.')
    if (renderedAssets.filter(asset => asset.contentType.startsWith('text/html')).reduce((size, asset) => size + Buffer.byteLength(asset.content), 0) > 16 * 1024 * 1024) throw new Error('Rendered public knowledge source exceeds release limit.')
    pages = renderedAssets.map(asset => publishedPage(asset, origin, blueprint.locale)).filter((page): page is NonNullable<typeof page> => page !== null).sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0)
    if (new Set(pages.map(page => page.url)).size !== pages.length) throw new Error('Duplicate rendered public page.')
  }
  const index = [
    `# ${markdown(blueprint.brandName)}`, `> ${markdown(pages.find(page => page.url === `${origin}/`)?.description || blueprint.brandName).replace(/\n/gu, '\n> ')}`,
    `Language: ${htmlSiteLanguage(blueprint.locale)}`,
    '## Pages', ...pages.map(page => `- [${markdown(page.title).replace(/\n/gu, ' ')}](${page.url}): ${markdown(page.description).replace(/\n/gu, ' ')}`),
    '## Resources', `- [Full website text](${origin}/llms-full.txt)`, `- [Entity map](${origin}/site-entity-map.json)`,
  ].join('\n\n') + '\n'
  const full = [`# ${markdown(blueprint.brandName)}`, ...pages.map(page => page.body)].join('\n\n')
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [managedSitePublicOrganization(blueprint, origin), ...pages.map(page => ({ '@type': 'WebPage', '@id': page.url, url: page.url, name: page.title, description: page.description, inLanguage: page.language, publisher: { '@id': `${origin}/#organization` } }))],
  }
  const assets: PublicKnowledgeAsset[] = [
    { path: 'llms.txt', contentType: 'text/plain; charset=utf-8', content: index },
    { path: 'llms-full.txt', contentType: 'text/plain; charset=utf-8', content: full },
    { path: 'site-entity-map.json', contentType: 'application/ld+json; charset=utf-8', content: JSON.stringify(graph) },
  ]
  const manifest = {
    schemaVersion: PUBLIC_KNOWLEDGE_VERSION,
    canonicalOrigin: origin,
    language: htmlSiteLanguage(blueprint.locale),
    basis: 'same_release_public_content',
    documents: assets.map(asset => ({ path: asset.path, sha256: digest(asset.content) })),
    pages: pages.map(({ url, contentHash }) => ({ url, contentHash })),
    limitations: ['not_independent_fact_verification', 'not_a_citation_prediction', 'not_an_access_control_policy'],
  }
  assets.push({ path: 'site-knowledge-manifest.json', contentType: 'application/json; charset=utf-8', content: JSON.stringify({ ...manifest, revision: digest(JSON.stringify(manifest)) }) })
  if (assets.reduce((bytes, asset) => bytes + Buffer.byteLength(asset.content), 0) > MAX_KNOWLEDGE_BYTES) throw new Error('Public knowledge output exceeds release limit.')
  return assets
}
