import { describe, expect, it } from 'vitest'
import { brandStudioFixture } from './fixtures/managed-site/brand-studio'
import { renderStudioPage } from '../server/managed-sites/live-connectors/internal-broker/studio-renderer'
import { renderStudioPage as legacy } from '../server/managed-sites/live-connectors/internal-broker/studio-renderer-legacy'
import { renderManagedSiteStaticAssets } from '../server/managed-sites/live-connectors/internal-broker/static-renderer'
import { isStudioPresentation } from '../utils/managedSitePresentation'
import { extractStudioReference, normaliseStudioReferenceCss } from '../server/managed-sites/funnel/studio-reference'
import { assertStudioFunctionalDelivery } from '../server/managed-sites/live-connectors/studio-delivery-check'
import { studioProposalId } from '../server/managed-sites/funnel/studio-state'

describe('version-bound branded website generation', () => {
  it.each(['atelier', 'bloom', 'alignment'] as const)('uses one actual %s renderer for preview and production with readable content and working local routes', preset => {
    const blueprint = brandStudioFixture()
    const preview = renderStudioPage(blueprint, blueprint.pages[0]!, preset)
    const live = renderManagedSiteStaticAssets(blueprint, [], 'https://brand.acme.taipei', preset).find(file => file.path === 'index.html')!.content
    expect(preview.match(/<body[\s\S]*<\/body>/u)?.[0]).toBe(live.match(/<body[\s\S]*<\/body>/u)?.[0])
    expect(live).toContain('data-studio-renderer="brand-studio-v2"')
    expect(live).toContain('href="/services"')
    expect(live).toContain('chapter-intro')
    expect(live).toContain('class="steps"')
    expect(live).toContain('prefers-reduced-motion')
    expect(live).toContain('flex:0 0 2ch;white-space:nowrap')
    expect(live).not.toMatch(/<script(?! type="application\/ld\+json")|src="https:|@import/iu)
  })
  it('does not change already-approved v1 sites when deploying the new renderer', () => {
    const blueprint = brandStudioFixture()
    delete blueprint.studioPresentation!.renderer
    expect(renderStudioPage(blueprint, blueprint.pages[0]!, 'atelier')).toBe(legacy(blueprint, blueprint.pages[0]!, 'atelier'))
    expect(isStudioPresentation(blueprint.studioPresentation)).toBe(true)
  })
  it('binds the rendering edition to the proposal identity and rejects arbitrary edition strings', () => {
    const blueprint = brandStudioFixture()
    const proposal = { blueprint, brief: { brandName: 'ÉCLAT', brief: 'Jewellery', siteType: 'brand_blog' as const, goal: 'build_brand' as const }, source: 'llm' as const, sourceReason: 'fixture', generatedAt: '2026-10-14T00:00:00Z' }
    const current = studioProposalId(1, proposal)
    delete blueprint.studioPresentation!.renderer
    expect(studioProposalId(1, proposal)).not.toBe(current)
    expect(isStudioPresentation({ ...blueprint.studioPresentation, renderer: '<script>' })).toBe(false)
  })
  it('keeps utility pages task-focused and makes FAQ and mobile navigation work without scripts', () => {
    const blueprint = brandStudioFixture()
    for (const key of ['contact', 'faq']) {
      const html = renderStudioPage(blueprint, blueprint.pages.find(page => page.pageKey === key)!, 'bloom')
      expect(html).not.toContain('<figure class="hero-figure"')
      expect(html).toContain('<details class="mobile-navigation">')
    }
    const faq = renderStudioPage(blueprint, blueprint.pages.find(page => page.pageKey === 'faq')!, 'atelier')
    expect(faq).toContain('<details><summary>Can I ask about a piece?')
  })
  it('retains the real form endpoint, required consent and brand-styled noindex thank-you page', () => {
    const blueprint = brandStudioFixture({ formEndpoint: 'https://forms.acme.taipei/api/managed-sites/site-forms/' + 'c'.repeat(64) + '/submit' })
    const files = renderManagedSiteStaticAssets(blueprint, [], 'https://brand.acme.taipei')
    const contact = files.find(file => file.path === 'contact/index.html')!.content
    expect(contact).toContain('action="https://forms.acme.taipei/')
    expect(contact).toContain('name="contactConsent" value="yes" required')
    expect(contact).toContain('name="companyFax"')
    const thanks = files.find(file => file.path === 'thanks/index.html')!.content
    expect(thanks).toContain('data-studio-renderer="brand-studio-v2"')
    expect(thanks).toContain('noindex, nofollow, noarchive')
    expect(thanks).not.toContain('<form')
    expect(() => assertStudioFunctionalDelivery(blueprint)).not.toThrow()
    expect(() => assertStudioFunctionalDelivery(brandStudioFixture())).toThrow()
  })
  it('escapes brand and copy, refuses executable links and gives dark surfaces their own readable ink', () => {
    const blueprint = brandStudioFixture()
    blueprint.brandName = '<img onerror="alert(1)">'
    blueprint.pages[0]!.sections[0]!.ctaHref = 'javascript:alert(1)'
    blueprint.studioPresentation!.design.surface = '#111111'
    const html = renderStudioPage(blueprint, blueprint.pages[0]!, 'atelier')
    expect(html).not.toContain('<img onerror')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('--surfaceInk:#ffffff')
  })
  it('respects RTL and never translates customer copy inside the renderer', () => {
    const blueprint = brandStudioFixture({ locale: 'ar' })
    blueprint.pages[0]!.title = 'تفاصيل صغيرة، حضور دائم'
    const html = renderStudioPage(blueprint, blueprint.pages[0]!, 'alignment')
    expect(html).toContain('lang="ar" dir="rtl"')
    expect(html).toContain('<h1>تفاصيل صغيرة، حضور دائم</h1>')
    expect(html).toContain('<bdi dir="ltr">01 / 05</bdi>')
  })
})

describe('reference palette and composition become real design inputs', () => {
  it('understands CSS variables, rgb colours, short hex and rem spacing without a model or remote font', () => {
    const css = ':root{--paper:rgb(250,245,240);--text:#222;--title:"Baskerville",serif}body{background:var(--paper);color:var(--text)}.hero{display:grid;grid-template-columns:1fr 1fr;padding:6rem}.hero h1{font-family:var(--title)}a{color:#914b5b}'
    const reference = extractStudioReference('https://example.com', '<style>' + css + '</style>' + '<img>'.repeat(8), [], true)
    expect(reference.design).toMatchObject({ canvas: '#faf5f0', ink: '#222222', layout: 'editorial', typography: 'serif' })
    expect(reference.design.tuning?.density).toBe('airy')
    expect(reference.fonts).toContain('Baskerville')
    const blueprint = brandStudioFixture()
    blueprint.studioPresentation!.design = reference.design
    const html = renderStudioPage(blueprint, blueprint.pages[0]!, 'atelier')
    expect(html).toContain('--canvas:#faf5f0')
    expect(html).toContain('class="layout-editorial')
  })
  it('selects full-width campaign layout from the hero rather than incidental content grids', () => {
    const reference = extractStudioReference('https://example.com', '<style>body{background:#fff}.campaign-hero{width:100vw;aspect-ratio:16/9}.footer{display:grid}</style>', [], true)
    expect(reference.design.layout).toBe('showcase')
    expect(reference.design.canvas).toBe('#ffffff')
  })
  it('keeps cyclic tokens bounded and does not execute CSS or admit CSS code into design', () => {
    const css = ':root{--a:var(--b);--b:var(--a)}body{background:var(--a);font-family:url(https://invalid.test/private)}'
    expect(normaliseStudioReferenceCss(css).length).toBeLessThan(1000)
    const reference = extractStudioReference('https://example.com', '<style>' + css + '</style>', [], true)
    expect(JSON.stringify(reference.design)).not.toMatch(/url\(|invalid|var\(/u)
  })
})
