import { createError } from 'h3'
import type { ManagedSiteFunnelSession } from '../../database/schema'
import {
  studioAnswers,
  STUDIO_DIRECTIONS,
  type StudioBrief,
  type StudioPreview,
  type StudioPreviewRequest,
  type StudioStrategy,
} from '../../../utils/managedSiteStudio'
import {
  generateFunnelPreviewDraft,
  type FunnelPreviewDraftDependencies,
} from './preview-draft-service'
import { buildSiteSpec } from '../site-spec'
import { resolveWebsiteStudioProviderConfiguration } from '../../llm-provider/website-studio'
import { renderManagedSiteStaticAssets } from '../live-connectors/internal-broker/static-renderer'
import type { ManagedSiteBlueprintV1 } from '../live-connectors/types'
import {
  createStudioBlueprint,
  createStudioIntelligenceAdapter,
  diffStudioCopy,
  outlineStudioStrategy,
  projectStudioCopy,
  STUDIO_COPY_MAX_BYTES,
  STUDIO_PAGE_LABELS,
} from './studio-intelligence'

export function parseStudioRequest(
  body: Record<string, unknown>
): StudioPreviewRequest {
  const fail = (): never => {
    throw createError({
      statusCode: 422,
      statusMessage: '請填寫品牌、需求，並選擇支援的網站類型與目標。',
    })
  }
  const text = (value: unknown, max: number): string =>
    typeof value === 'string' && value.trim() && value.trim().length <= max
      ? value.trim()
      : fail()
  if (
    Object.keys(body).some(
      key =>
        ![
          'brandName',
          'brief',
          'siteType',
          'goal',
          'mode',
          'revision',
        ].includes(key)
    )
  )
    fail()
  if (
    !['one_page', 'brand_blog', 'simple_commerce'].includes(
      String(body.siteType)
    )
  )
    fail()
  if (
    ![
      'increase_inquiries',
      'increase_bookings',
      'sell_online',
      'build_brand',
    ].includes(String(body.goal))
  )
    fail()
  if (
    body.mode !== undefined &&
    !['template', 'ai'].includes(String(body.mode))
  )
    fail()
  let revision: StudioPreviewRequest['revision']
  if (body.revision !== undefined) {
    if (
      body.mode !== 'ai' ||
      !body.revision ||
      typeof body.revision !== 'object' ||
      Array.isArray(body.revision)
    )
      fail()
    const value = body.revision as Record<string, unknown>
    if (
      Object.keys(value).some(key => !['base', 'instruction', 'proposalId'].includes(key)) ||
      !Object.hasOwn(value, 'base') ||
      !Object.hasOwn(value, 'instruction')
    )
      fail()
    if (
      !value.base ||
      typeof value.base !== 'object' ||
      Array.isArray(value.base) ||
      Buffer.byteLength(JSON.stringify(value.base), 'utf8') >
        STUDIO_COPY_MAX_BYTES
    )
      fail()
    // Its exact copy-slot identities are revalidated against the server's skeleton before any model call.
    revision = {
      instruction: text(value.instruction, 600),
      base: value.base as NonNullable<StudioPreviewRequest['revision']>['base'],
      ...(value.proposalId !== undefined ? { proposalId: text(value.proposalId, 64) } : {}),
    }
  }
  return {
    brandName: text(body.brandName, 160),
    brief: text(body.brief, 1800),
    siteType: body.siteType as StudioBrief['siteType'],
    goal: body.goal as StudioBrief['goal'],
    mode: body.mode === 'ai' ? 'ai' : 'template',
    ...(revision ? { revision } : {}),
  }
}

/** Preview only: no writes, fake contacts, paid orders, domain calls, or release creation. */
export async function generateStudioPreview(
  session: ManagedSiteFunnelSession,
  input: ReturnType<typeof parseStudioRequest>,
  dependencies: FunnelPreviewDraftDependencies = {}
): Promise<StudioPreview> {
  if (session.status !== 'active')
    throw createError({
      statusCode: 409,
      statusMessage: '這份申請已進入建置流程，不能重新產生設計。',
    })
  let blueprint: ManagedSiteBlueprintV1 | undefined
  let strategy: StudioStrategy | undefined
  // The explicit non-AI path must never even resolve live credentials.
  const configuration =
    input.mode === 'template'
      ? { configured: false as const, reason: 'endpoint-missing' as const }
      : dependencies.providerConfiguration ||
        resolveWebsiteStudioProviderConfiguration()
  const adapter = configuration.configured
    ? dependencies.generationAdapter ||
      createStudioIntelligenceAdapter({
        input,
        configuration,
        fetchImpl: dependencies.fetchImpl,
        onStrategy: value => {
          strategy = value
        },
      })
    : undefined
  const previewSession = {
    ...session,
    answers: {
      ...studioAnswers(input, 'atelier'),
      existingSite: { hasSite: false },
      modules: input.siteType === 'simple_commerce' ? ['shopify_commerce'] : [],
    },
  }
  const draft = await generateFunnelPreviewDraft(previewSession, {
    ...dependencies,
    providerConfiguration: configuration,
    generationAdapter: adapter,
    templateBuilder: request => createStudioBlueprint(request, input),
    onBlueprint: value => {
      blueprint = value
    },
    siteSpec: buildSiteSpec({
      draftIdentity: `managed-site-studio-${session.id}`,
      locale: 'zh-hant',
      brandName: input.brandName,
      audience: '品牌網站訪客',
      brief: input.brief,
      businessGoals: [input.goal],
      siteType: input.siteType,
      selectedModules:
        input.siteType === 'simple_commerce' ? ['shopify_commerce'] : [],
      styleReferences: [],
    }),
    // This service renders every page in all three presets below; avoid rendering them twice.
    includeDesignVariants: false,
  })
  // A failed edit must never replace a customer's existing copy with a fallback template.
  if (input.revision && draft.source !== 'llm')
    throw createError({
      statusCode: 503,
      statusMessage:
        'AI 這次沒有完成修改，原本的網站草稿保持不變。請稍後再試。',
    })
  if (!blueprint)
    throw createError({
      statusCode: 503,
      statusMessage: '網站草稿暫時無法顯示。',
    })
  const finalBlueprint: ManagedSiteBlueprintV1 = blueprint
  dependencies.onBlueprint?.(finalBlueprint)
  return renderStudioProposal(finalBlueprint, {
    source: draft.source,
    sourceReason: input.mode === 'template' ? '以你的需求套用三種版型；這次沒有呼叫 AI。' : draft.sourceReason,
    generatedAt: draft.generatedAt,
    strategy: draft.source === 'llm' && strategy ? strategy : outlineStudioStrategy(input, finalBlueprint),
    changes: input.revision ? diffStudioCopy(input.revision.base, projectStudioCopy(finalBlueprint)) : [],
  })
}

/** Re-render saved public content without a model call; HTML is never the stored authority. */
export function renderStudioProposal(finalBlueprint: ManagedSiteBlueprintV1, metadata: Pick<StudioPreview, 'source' | 'sourceReason' | 'generatedAt' | 'strategy' | 'changes' | 'proposalId'>): StudioPreview {
  const copy = projectStudioCopy(finalBlueprint)
  const variants = STUDIO_DIRECTIONS.map(direction => ({
    preset: direction.key,
    assets: renderManagedSiteStaticAssets(
      finalBlueprint,
      [],
      undefined,
      direction.key
    ),
  }))
  const pages = finalBlueprint.pages.map(page => ({
    key: page.pageKey,
    label: STUDIO_PAGE_LABELS[page.pageKey],
    designs: variants.map(variant => ({
      preset: variant.preset,
      html: inertPreviewDocument(
        variant.assets.find(
          asset =>
            asset.path ===
            (page.route === '/'
              ? 'index.html'
              : `${page.route.slice(1)}/index.html`)
        )!.content
      ),
    })),
  }))
  return {
    ...metadata,
    headline: finalBlueprint.pages[0]!.title,
    sections: finalBlueprint.pages[0]!.sections.map(({ heading, body }) => ({ heading, body })),
    designs: pages[0]!.designs,
    pages,
    editContext: copy,
  }
}

function inertPreviewDocument(html: string): string {
  // Keep the generated document display-only. No private-origin navigation, external images,
  // form submission, scripts, or resource fetches may escape the sandboxed preview.
  return html
    .replace(
      '<head>',
      "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'\">"
    )
    .replace(/\shref="[^"]*"/gu, ' aria-disabled="true"')
    .replace(
      'AI visibility, ranking, traffic, conversion and revenue are not guaranteed or inferred from this preview.',
      '這份預覽不代表實際搜尋排名、流量或營收成效。'
    )
    .replace(
      'External provider calls, domain purchase, DNS, payment and deployment are not executed in concept or preview mode.',
      '預覽不會購買網域、設定 DNS、付款或部署。'
    )
}
