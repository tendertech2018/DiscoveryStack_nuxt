import { describe, expect, it, vi } from 'vitest'
import {
  generateStudioPreview,
  parseStudioRequest,
} from '../server/managed-sites/funnel/studio-preview'
import { diffStudioCopy } from '../server/managed-sites/funnel/studio-intelligence'
import { createFunnelSession } from '../server/managed-sites/funnel/session-service'
import { createFunnelSessionMemoryRepository } from './fixtures/managed-site/funnel-session-repository'
import { studioModelFetch } from './fixtures/managed-site/studio-model'

const brief = {
  brandName: '日光工作室',
  brief: '我們提供初學瑜伽課程，希望客人先了解課程與常見問題，再洽詢預約。',
  siteType: 'brand_blog',
  goal: 'increase_bookings',
  mode: 'ai',
} as const
const provider = {
  configured: true as const,
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'isolated-test',
  apiKey: 'not-a-live-key',
  providerLabel: 'openai' as const,
  source: 'llm' as const,
}
const session = async () =>
  (await createFunnelSession(createFunnelSessionMemoryRepository().repository))
    .session

describe('studio business strategy and copy proposals — isolated transport', () => {
  it.each(['one_page', 'brand_blog', 'simple_commerce'] as const)(
    'generates strategy and every %s page from one provider call',
    async siteType => {
      const fetchImpl = vi.fn(studioModelFetch())
      const result = await generateStudioPreview(
        await session(),
        parseStudioRequest({ ...brief, siteType }),
        { providerConfiguration: provider, fetchImpl }
      )
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(result.source).toBe('llm')
      expect(result.strategy).toMatchObject({
        source: 'llm',
        recommendedPreset: 'bloom',
        facts: [brief.brief],
      })
      expect(result.strategy!.journey).toHaveLength(3)
      expect(result.pages).toHaveLength(
        siteType === 'one_page' ? 1 : siteType === 'brand_blog' ? 6 : 5
      )
      for (const page of result.pages!) {
        expect(page.designs).toHaveLength(3)
        for (const design of page.designs) {
          expect(design.html).toContain('Content-Security-Policy')
          expect(design.html).not.toMatch(/<script\b|\shref=|\son[a-z]+=/iu)
        }
      }
      expect(
        result.pages!.find(page => page.key === 'home')!.designs[0]!.html
      ).toContain('找到你的開始方式')
      if (siteType !== 'one_page')
        expect(
          result.pages!.find(page => page.key === 'faq')!.designs[0]!.html
        ).toContain('FAQ')
    }
  )
  it('keeps revision instructions separate, preserves untouched copy, and derives an exact before/after diff', async () => {
    const currentSession = await session()
    const initial = await generateStudioPreview(
      currentSession,
      parseStudioRequest(brief),
      { providerConfiguration: provider, fetchImpl: studioModelFetch() }
    )
    const base = structuredClone(initial.editContext!)
    const fetchImpl = vi.fn(
      studioModelFetch((_response, context) => {
        expect(context.previousCopy).toEqual(base)
        expect(context.brief).toBe(brief.brief)
        expect(context.editInstruction).toBe('首頁更精簡一點，其他內容保留')
        return _response
      })
    )
    const proposal = await generateStudioPreview(
      currentSession,
      parseStudioRequest({
        ...brief,
        revision: { instruction: '首頁更精簡一點，其他內容保留', base },
      }),
      { providerConfiguration: provider, fetchImpl }
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(proposal.changes!.map(change => change.key)).toEqual([
      'page:home:title',
      'page:home:description',
    ])
    expect(proposal.changes![0]!.before).toBe(initial.headline)
    expect(proposal.changes![0]!.after).toBe(proposal.headline)
    expect(proposal.editContext!.sections).toEqual(base.sections)
    expect(initial.editContext).toEqual(base)
    expect(proposal.designs[0]!.html).not.toContain(
      '首頁更精簡一點，其他內容保留'
    )
    expect(diffStudioCopy(base, base)).toEqual([])
  })
  it.each([
    [
      'invented quote',
      (value: any) => {
        value.strategy.facts = ['有十萬名忠實客戶']
      },
    ],
    [
      'HTML',
      (value: any) => {
        value.copy.pages[0].description = '<img src=x onerror=alert(1)>'
      },
    ],
    [
      'unknown operations',
      (value: any) => {
        value.copy.deploy = true
      },
    ],
    [
      'foreign page',
      (value: any) => {
        value.strategy.journey[0].pageKey = 'admin'
      },
    ],
    [
      'unknown route',
      (value: any) => {
        value.copy.navigation[0].route = 'https://attacker.test'
      },
    ],
    [
      'missing slot',
      (value: any) => {
        value.copy.sections.pop()
      },
    ],
    [
      'extra field',
      (value: any) => {
        value.untrusted = 'publish now'
      },
    ],
    [
      'oversized text',
      (value: any) => {
        value.copy.sections[0].body = 'x'.repeat(8100)
      },
    ],
  ])(
    'does not label rejected %s output as AI success',
    async (_label, mutate) => {
      const result = await generateStudioPreview(
        await session(),
        parseStudioRequest(brief),
        {
          providerConfiguration: provider,
          fetchImpl: studioModelFetch(value => {
            ;(mutate as (value: any) => void)(value)
            return value
          }),
        }
      )
      expect(result.source).toBe('template')
      expect(result.strategy!.source).toBe('outline')
      expect(result.designs[0]!.html).not.toContain('onerror')
    }
  )
  it('keeps failed revisions out of fallback templates and validates context before calling the provider', async () => {
    const currentSession = await session()
    const original = await generateStudioPreview(
      currentSession,
      parseStudioRequest({ ...brief, mode: 'template' })
    )
    const input = parseStudioRequest({
      ...brief,
      revision: { instruction: '更精簡', base: original.editContext },
    })
    const offline = vi.fn(async () => {
      throw new Error('DO_NOT_LEAK_provider_secret')
    }) as unknown as typeof fetch
    await expect(
      generateStudioPreview(currentSession, input, {
        providerConfiguration: provider,
        fetchImpl: offline,
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: expect.not.stringContaining('DO_NOT_LEAK'),
    })
    await expect(
      generateStudioPreview(currentSession, input, {
        providerConfiguration: {
          configured: false,
          reason: 'endpoint-missing',
        },
      })
    ).rejects.toMatchObject({ statusCode: 503 })
    const invalid = structuredClone(input)
    invalid.revision!.base.sections[0]!.sectionId = 'forged-admin-slot'
    const noCall = vi.fn(studioModelFetch())
    await expect(
      generateStudioPreview(currentSession, invalid, {
        providerConfiguration: provider,
        fetchImpl: noCall,
      })
    ).rejects.toMatchObject({ statusCode: 503 })
    expect(noCall).not.toHaveBeenCalled()
    expect(original.headline).toBe(brief.brandName)
  })
  it('rejects overlong/nested authority inputs without echoing private data to model context', async () => {
    for (const revision of [
      { instruction: 'x'.repeat(601), base: {} },
      { instruction: 'hi', base: {}, ownerUserId: 9 },
      { instruction: 'hi', base: 'invalid' },
      { instruction: 'hi', base: { text: 'x'.repeat(29_000) } },
    ])
      expect(() => parseStudioRequest({ ...brief, revision })).toThrow()
    expect(() =>
      parseStudioRequest({
        ...brief,
        mode: 'template',
        revision: { instruction: 'hi', base: {} },
      })
    ).toThrow()
    const fetchImpl = vi.fn(
      studioModelFetch((value, context) => {
        expect(JSON.stringify(context)).not.toContain('SECRET_SESSION')
        return value
      })
    )
    await generateStudioPreview(
      {
        ...(await session()),
        answers: {
          contact: {
            email: 'SECRET_SESSION@example.test',
            contactName: 'SECRET_SESSION',
          },
        },
      },
      parseStudioRequest(brief),
      { providerConfiguration: provider, fetchImpl }
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
