import type { ManagedSiteBlueprintV1 } from '../types'
import type { CustomerSitePreset } from '../../site-spec'
import { renderStudioPage as renderLegacyStudioPage, STUDIO_CSS as LEGACY_CSS } from './studio-renderer-legacy'
import { renderBrandStudioPage } from './studio-brand-renderer'
import { BRAND_STUDIO_CSS } from './studio-brand-styles'

export const STUDIO_RENDERER_VERSION = 'brand-studio-v2'
export const STUDIO_CSS = LEGACY_CSS + BRAND_STUDIO_CSS

/** The presentation edition is part of the approved content hash, not a deployment-time decision. */
export function renderStudioPage(blueprint: ManagedSiteBlueprintV1, page: ManagedSiteBlueprintV1['pages'][number], preset: CustomerSitePreset, canonicalOrigin?: string): string {
  return blueprint.studioPresentation?.renderer === 'brand-studio-v2'
    ? renderBrandStudioPage(blueprint, page, preset, canonicalOrigin)
    : renderLegacyStudioPage(blueprint, page, preset, canonicalOrigin)
}
