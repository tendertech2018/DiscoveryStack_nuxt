import type { ManagedSiteBlueprintV1, ManagedSiteBlueprintSectionV1 } from '../types'
import type { CustomerSitePreset } from '../../site-spec'
import { renderManagedSiteContactForm } from '../blueprint'
import { renderManagedSiteMetadataHead } from '../../seo-metadata'
import { htmlSiteLanguage, siteTextDirection } from '../../../../utils/managedSiteLanguage'
import { DEFAULT_STUDIO_TUNING, isStudioPresentation, legibleInk, type StudioMedia } from '../../../../utils/managedSitePresentation'
import { BRAND_STUDIO_CSS } from './studio-brand-styles'

const esc = (value: string) => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;')
const number = (value: number) => String(value).padStart(2, '0')
const fonts = { serif: '"Iowan Old Style","Palatino Linotype",Baskerville,Georgia,serif', sans: '"Avenir Next",Arial,sans-serif', rounded: 'ui-rounded,"Trebuchet MS",sans-serif', mono: 'ui-monospace,monospace' }

/** URLs remain server-owned. Defence in depth even when called outside the blueprint compiler. */
function href(raw: string): string | null {
  if (/[\u0000-\u0020\u007f\\]/u.test(raw) || raw.startsWith('//')) return null
  if (/^\/(?!\/)/u.test(raw) || /^#[a-z0-9][a-z0-9_-]*$/iu.test(raw)) return esc(raw)
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? esc(url.toString()) : null } catch { return null }
}
function link(label: string, target: string, className = 'link'): string {
  const safe = href(target)
  return safe ? `<a class="${className}" href="${safe}"><span>${esc(label)}</span><span class="arrow" aria-hidden="true">↗</span></a>` : ''
}
function photo(image: StudioMedia, eager = false): string {
  return `<img class="brand-photo" src="${image.dataUrl}" alt="${esc(image.alt)}" width="${image.width}" height="${image.height}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}>`
}
/** Only supplied text is segmented; we never manufacture products, reviews, prices or business claims. */
function prose(body: string, steps = false): string {
  const parts = steps ? body.split(/\s*→\s*|\n+/u).map(part => part.trim()).filter(Boolean) : []
  return parts.length > 1 && parts.length <= 6
    ? `<ol class="steps">${parts.map((part, index) => `<li><span class="step-no" aria-hidden="true">${number(index + 1)}</span><span>${esc(part)}</span></li>`).join('')}</ol>`
    : `<p>${esc(body)}</p>`
}

/** Original reusable brand layouts, rendered by the exact same path for preview and release. */
export function renderBrandStudioPage(blueprint: ManagedSiteBlueprintV1, page: ManagedSiteBlueprintV1['pages'][number], preset: CustomerSitePreset, canonicalOrigin?: string): string {
  const presentation = blueprint.studioPresentation
  if (!isStudioPresentation(presentation) || presentation.renderer !== 'brand-studio-v2') throw new Error('Invalid brand studio presentation')
  const { design, chrome } = presentation
  const tuning = design.tuning || DEFAULT_STUDIO_TUNING
  const layout = preset === 'atelier' ? design.layout : preset === 'bloom' ? 'showcase' : 'structured'
  const ink = legibleInk(design.canvas, design.ink)
  // Surface and CTA contrasts are independent of the page canvas.
  const variables = `:root{--canvas:${design.canvas};--surface:${design.surface};--ink:${ink};--surfaceInk:${legibleInk(design.surface, ink)};--accent:${design.accent};--accentInk:${legibleInk(design.accent)};--display:${fonts[design.typography]};--weight:${tuning.headingWeight};--radius:${{ square: '0px', soft: '12px', round: '32px' }[tuning.corners]};--space:${{ airy: '80px', balanced: '60px', compact: '40px' }[tuning.density]};--ratio:${{ portrait: '4/5', square: '1/1', landscape: '4/3', wide: '21/9' }[tuning.imageRatio]};--line:color-mix(in srgb,var(--ink) 19%,transparent);--wash:color-mix(in srgb,var(--canvas) 94%,var(--ink));--wordmark:${Math.min(16, 150 / Math.max(5, [...blueprint.brandName].length))}vw;--wordmark-mobile:${Math.min(20, 155 / Math.max(5, [...blueprint.brandName].length))}vw}`
  const pageLabel = blueprint.navigation.find(item => item.route === page.route)?.label || page.title
  const navigation = blueprint.navigation.map(item => {
    const target = href(item.route)
    return target ? `<a href="${target}"${page.route === item.route ? ' aria-current="page"' : ''}>${esc(item.label)}</a>` : ''
  }).join('')
  const header = `<header class="top wrap"><a class="brand" href="/">${esc(blueprint.brandName)}</a><nav class="nav desktop-navigation" aria-label="${esc(chrome.navigation)}">${navigation}</nav><details class="mobile-navigation"><summary aria-label="${esc(chrome.navigation)}"><span class="menu-open" aria-hidden="true">☰</span><span class="menu-close" aria-hidden="true">×</span></summary><nav class="nav" aria-label="${esc(chrome.navigation)}">${navigation}</nav></details></header>`
  const heroMedia = presentation.media?.find(image => image.slot === (page.pageKey === 'about' ? 'detail' : 'hero')) || presentation.media?.find(image => image.slot === 'hero')
  const detail = presentation.media?.find(image => image.slot === 'detail')
  const cta = page.sections.find(section => section.ctaHref && section.ctaLabel)
  const heroLink = cta ? link(cta.ctaLabel!, cta.ctaHref!) : ''
  const visual = heroMedia ? photo(heroMedia, true) : `<div class="brand-art"><span class="monogram" aria-hidden="true">${esc([...blueprint.brandName][0] || '')}</span><span class="art-signature">${esc(blueprint.brandName)}</span></div>`
  // Utility pages focus on their task, rather than repeating a giant campaign image on every route.
  const utility = ['contact', 'faq', 'blog'].includes(page.pageKey)
  const figure = utility ? '' : `<figure class="hero-figure"><div class="visual${heroMedia ? ' has-photo' : ''}">${visual}</div><figcaption class="visual-note"><span>${esc(blueprint.brandName)}</span><span><bdi dir="ltr">${number(blueprint.pages.indexOf(page) + 1)} / ${number(blueprint.pages.length)}</bdi></span></figcaption></figure>`
  const artifact = layout === 'editorial' && page.pageKey === 'home' && detail && heroMedia?.sha256 !== detail.sha256 ? `<figure class="hero-artifact">${photo(detail)}<figcaption>${esc(detail.alt)}</figcaption></figure>` : ''
  const hero = `<section class="hero${[...page.title].length > 54 ? ' long-title' : ''}"><div class="hero-copy"><p class="eyebrow">${esc(pageLabel)}</p><h1>${esc(page.title)}</h1><div class="hero-story"><p class="lede">${esc(page.description)}</p>${heroLink}</div>${artifact}</div>${figure}</section>`
  const contentSections = page.sections.filter(section => section.kind !== 'hero')
  const sectionLink = (section: ManagedSiteBlueprintSectionV1) => section.ctaHref && section.ctaLabel ? link(section.ctaLabel, section.ctaHref) : ''
  let detailUsed = false
  const sections = contentSections.map((section, index) => {
    const isForm = section.kind === 'contact_form', isModule = section.kind === 'module_slot'
    const heading = isForm || isModule ? chrome.contact : section.heading
    const title = `<span class="number" aria-hidden="true">${number(index + 1)}</span><h2>${esc(heading)}</h2>`
    const identity = `id="${esc(section.sectionId)}" data-section-kind="${section.kind}"`
    if (isForm || isModule) {
      let form = renderManagedSiteContactForm(section)
        .replaceAll('姓名 ', `${esc(chrome.name)} `).replaceAll('訊息 ', `${esc(chrome.message)} `)
        .replaceAll('送出</button>', `${esc(chrome.submit)}</button>`).replaceAll('電話（選填）', esc(chrome.phone)).replaceAll('Email ', `${esc(chrome.email)} `)
        .replace(/<p class="module-note">[^<]*<\/p>$/u, `<p class="module-note">${esc(chrome.previewNotice)}</p>`)
      if (canonicalOrigin && section.formEndpoint) form = form.replace('<input type="text" name="companyFax"', `<label><span><input type="checkbox" name="contactConsent" value="yes" required> ${esc(chrome.consent)}</span></label><input type="text" name="companyFax"`)
      return `<section class="chapter chapter-form" ${identity}><div>${title}</div><div class="chapter-content">${isModule ? `<p class="module-note" data-module-placeholder="${esc(section.moduleKey || '')}">${esc(chrome.previewNotice)}</p>` : ''}${form}</div></section>`
    }
    const isStory = !detailUsed && detail && ['services', 'about', 'shop_index'].includes(section.kind) && page.pageKey !== 'about'
    if (isStory) {
      detailUsed = true
      return `<section class="chapter chapter-story" ${identity}><figure class="story-photo">${photo(detail)}<figcaption class="story-caption">${esc(blueprint.brandName)}</figcaption></figure><div class="story-copy">${title}<div class="chapter-content">${prose(section.body)}${sectionLink(section)}</div></div></section>`
    }
    const kind = section.kind === 'contact' ? 'contact' : section.sectionId === 'home-journey' ? 'journey' : index === 0 && section.kind === 'summary' ? 'intro' : 'text'
    return `<section class="chapter chapter-${kind}" ${identity}><div>${title}</div><div class="chapter-content">${prose(section.body, kind === 'journey')}${sectionLink(section)}</div></section>`
  }).join('')
  const indexLinks = page.pageKey === 'home' ? `<nav class="index" aria-label="${esc(chrome.navigation)}">${contentSections.filter(section => !['module_slot', 'contact_form'].includes(section.kind)).slice(0, 4).map((section, index) => `<a href="#${esc(section.sectionId)}"><span aria-hidden="true">${number(index + 1)}</span>${esc(section.heading)}</a>`).join('')}</nav>` : ''
  const faq = page.pageKey === 'faq' && blueprint.faq.length ? `<section class="faq"><h2>${esc(chrome.faq)}</h2><div>${blueprint.faq.map(item => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}</div></section>` : ''
  const footer = `<footer class="site-footer wrap"><div class="footer-meta"><p>${esc(blueprint.seoGeo.summaryAnswer)}</p><nav aria-label="${esc(chrome.navigation)}">${navigation}</nav></div><p class="footer-wordmark">${esc(blueprint.brandName)}</p></footer>`
  const metadata = canonicalOrigin ? renderManagedSiteMetadataHead({ blueprint, canonicalOrigin, canonicalPath: page.route, title: page.title, locale: blueprint.locale, faq: faq ? blueprint.faq : [] }) : ''
  const skip = ({ en: 'Skip to content', zh: '跳至主要內容', ja: '本文へ移動', ko: '본문으로 이동', fr: 'Aller au contenu', de: 'Zum Inhalt springen', es: 'Saltar al contenido', pt: 'Ir para o conteúdo', ar: 'انتقل إلى المحتوى', hi: 'मुख्य सामग्री पर जाएँ' } as Record<string, string>)[blueprint.locale.split('-')[0]!] || 'Skip to content'
  return `<!doctype html><html lang="${htmlSiteLanguage(blueprint.locale)}" dir="${siteTextDirection(blueprint.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(page.description)}">${!canonicalOrigin ? '<meta name="robots" content="noindex,nofollow">' : ''}<title>${esc(page.title)} · ${esc(blueprint.brandName)}</title>${metadata}<style>${variables}${BRAND_STUDIO_CSS}</style></head><body data-studio-renderer="brand-studio-v2" data-site-preset="${preset}" class="layout-${layout} motion-${design.motion} page-${page.pageKey} ${page.pageKey !== 'home' ? 'page-inner' : ''} button-${tuning.button}${tuning.navigation === 'sticky' ? ' sticky-nav' : ''}"><a class="skip-link" href="#site-content">${skip}</a>${header}<main id="site-content" tabindex="-1" class="wrap">${hero}${indexLinks}<div class="chapters">${sections}</div>${faq}</main>${footer}</body></html>`
}
