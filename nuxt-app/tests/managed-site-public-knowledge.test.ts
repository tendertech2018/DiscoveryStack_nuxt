import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { renderManagedSitePublicKnowledge } from '../server/managed-sites/public-knowledge'
import { renderManagedSiteStaticAssets } from '../server/managed-sites/live-connectors/internal-broker/static-renderer'
import type { ManagedSiteBlueprintV1 } from '../server/managed-sites/live-connectors/types'

const origin = 'https://brand.acme.taipei'
const site: ManagedSiteBlueprintV1 = {
  schemaVersion: 'managed-site-blueprint-v1', brandName: 'Atelier', locale: 'fr', siteType: 'one_page', navigation: [{ label: 'Accueil', route: '/' }],
  pages: [{ pageKey: 'home', route: '/', title: 'Bonjour Atelier', description: 'Une marque indépendante.', sections: [{ sectionId: 'hero', kind: 'hero', heading: 'Nos services', body: 'Une création sur mesure.', ctaLabel: null, ctaHref: null, formEndpoint: null, moduleKey: null }] }],
  faq: [{ question: 'Unpublished question', answer: 'Never publish this answer without a visible FAQ.' }], selectedModulePlacements: [],
  seoGeo: { summaryAnswer: 'Private summary not rendered', canonicalPlaceholder: '{{CANONICAL_ORIGIN}}', organizationName: 'Atelier', evidenceLimitations: ['Public limitation'], structuredDataKinds: ['Organization'] },
  provenance: { evidenceSnapshotHash: 'a'.repeat(64), authoritySourceIds: ['private-source-id'], providerContentHash: 'b'.repeat(64) },
}
const knowledge = (blueprint = site) => renderManagedSiteStaticAssets(blueprint, [], origin).filter(asset => /^(?:llms|site-)/u.test(asset.path))

describe('published brand knowledge and llms assets', () => {
  it('emits valid markdown links, complete visible text and matching organization JSON-LD', () => {
    const assets = knowledge(), index = assets.find(asset => asset.path === 'llms.txt')!.content
    expect(index).toMatch(/^# Atelier\n/u); expect(index).toContain(`](${origin}/)`)
    expect(index).toContain(`](${origin}/llms-full.txt)`)
    expect(assets.find(asset => asset.path === 'llms-full.txt')!.content).toContain('Nos services')
    const graph = JSON.parse(assets.find(asset => asset.path === 'site-entity-map.json')!.content)['@graph']
    expect(graph[0]).toEqual({ '@type': 'Organization', '@id': `${origin}/#organization`, name: 'Atelier', url: origin })
    expect(graph[1].url).toBe(`${origin}/`)
    expect(graph[1].inLanguage).toBe('fr')
    expect(JSON.stringify(graph)).not.toMatch(/price|aggregateRating|offers/u)
  })
  it('never exports private provenance, form endpoints, unpublished FAQ or non-rendered summaries', () => {
    const serialized = JSON.stringify(knowledge())
    for (const forbidden of ['private-source-id', 'evidenceSnapshotHash', 'providerContentHash', 'Unpublished question', 'Private summary not rendered', 'formEndpoint', '{{CANONICAL_ORIGIN}}']) expect(serialized).not.toContain(forbidden)
  })
  it('replaces stale source llms content and binds deterministic hashes to rendered revisions', () => {
    const assets = renderManagedSiteStaticAssets(site, [{ path: 'public/llms.txt', content: 'stale-old-prices', sha256: 'c'.repeat(64), mediaType: 'text/markdown' }], origin)
    expect(assets.filter(asset => asset.path === 'llms.txt')).toHaveLength(1)
    expect(JSON.stringify(assets)).not.toContain('stale-old-prices')
    const manifest = JSON.parse(assets.find(asset => asset.path === 'site-knowledge-manifest.json')!.content)
    for (const item of manifest.documents) expect(item.sha256).toBe(createHash('sha256').update(assets.find(asset => asset.path === item.path)!.content).digest('hex'))
    expect(knowledge()).toEqual(knowledge(structuredClone(site)))
    const changed = structuredClone(site); changed.pages[0]!.sections[0]!.body = 'Les nouveaux services.'
    expect(JSON.parse(knowledge(changed).find(asset => asset.path === 'site-knowledge-manifest.json')!.content).revision).not.toBe(manifest.revision)
    expect(knowledge()).toEqual(assets.filter(asset => /^(?:llms|site-)/u.test(asset.path)))
  })
  it('projects final overlays, published articles and their languages, excluding noindex pages', () => {
    const rendered = (path: string, text: string, noindex = false) => ({ path, contentType: 'text/html', content: `<html lang="ja"><head><meta name="robots" content="${noindex ? 'noindex' : 'index'}"><meta name="description" content="概要"></head><body><main><h1>${text}</h1><p>新しい記事</p><form action="private-endpoint"><input value="private-value"></form></main></body></html>` })
    const assets = renderManagedSitePublicKnowledge(site, origin, [rendered('index.html', '新しいホーム'), rendered('ja/articles/topic/index.html', '公開記事'), rendered('private/index.html', 'PRIVATE TEXT', true)])
    const all = JSON.stringify(assets)
    expect(all).toContain('公開記事'); expect(all).toContain('新しいホーム'); expect(all).not.toContain('Bonjour Atelier')
    expect(all).not.toMatch(/PRIVATE TEXT|private-endpoint|private-value/u)
    const graph = JSON.parse(assets.find(asset => asset.path === 'site-entity-map.json')!.content)['@graph']
    expect(graph.slice(1).every((page: any) => page.inLanguage === 'ja')).toBe(true)
  })
  it('keeps user markup inert in markdown and does not decode escaped tags as elements', () => {
    const changed = structuredClone(site); changed.pages[0]!.sections[0]!.body = '<script>bad()</script> [fake](javascript:evil) & old'
    const full = knowledge(changed).find(asset => asset.path === 'llms-full.txt')!.content
    expect(full).not.toContain('<script>'); expect(full).not.toContain('[fake](javascript:evil)')
    expect(full).toContain('&lt;script&gt;'); expect(full).toContain('bad\\(\\)')
  })
  it.each(['http://brand.acme.taipei', 'https://127.0.0.1', 'https://brand.acme.taipei/?key=bad'])('rejects an unsafe canonical identity %s', value => {
    expect(() => renderManagedSitePublicKnowledge(site, value)).toThrow()
  })
  it('rejects duplicate routes, oversized output and missing rendered main content', () => {
    const changed = structuredClone(site); changed.pages.push(changed.pages[0]!)
    expect(() => renderManagedSitePublicKnowledge(changed, origin)).toThrow(/duplicate/u)
    changed.pages = [structuredClone(site.pages[0]!)]; changed.pages[0]!.sections[0]!.body = 'x'.repeat(200_001)
    expect(() => renderManagedSitePublicKnowledge(changed, origin)).toThrow()
    expect(() => renderManagedSitePublicKnowledge(site, origin, [{ path: 'index.html', contentType: 'text/html', content: '<html></html>' }])).toThrow(/main/u)
  })
})
