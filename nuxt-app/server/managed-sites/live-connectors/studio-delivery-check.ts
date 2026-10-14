import { createError } from 'h3'
import type { ManagedSiteBlueprintV1 } from './types'

/** A paid order or a manual-setup checkbox cannot turn a rendered placeholder into a working integration. */
export function assertStudioFunctionalDelivery(blueprint: ManagedSiteBlueprintV1) {
  if (!blueprint.studioPresentation) return // Existing releases keep their original gate contract.
  const unresolved = blueprint.selectedModulePlacements.filter(item => item.mode === 'safe_placeholder').map(item => item.moduleKey)
  const missingForm = blueprint.pages.some(page => page.sections.some(section => section.kind === 'contact_form' && !section.formEndpoint))
  if (unresolved.length || missingForm) throw createError({ statusCode: 409, statusMessage: 'Production is blocked: selected website functions are not activated in the confirmed artifact.', data: { code: 'STUDIO_FUNCTIONS_NOT_ACTIVATED', modules: unresolved, missingForm, nextAction: 'Complete real integration and verification, then approve a new exact artifact. Payment or a manual completion flag alone is not sufficient.' } })
}
