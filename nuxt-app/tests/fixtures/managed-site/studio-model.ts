/** Fixed model substitute for isolated tests/QA only. Never imported by runtime code. */
export function studioModelResponse(context: any) {
  const copy = structuredClone(context.previousCopy || context.copyShape)
  if (context.previousCopy) {
    copy.pages[0].title = `${context.brandName}，從容開始你的第一步`
    copy.pages[0].description =
      '不用一次準備好所有事。先認識我們的服務，再一起找到適合你的開始方式。'
  } else {
    copy.pages[0].title = `${context.brandName}，找到你的開始方式`
    copy.pages[0].description = '先了解服務、解開疑問，再決定最適合你的下一步。'
    copy.sections.find((item: any) => item.sectionId === 'home-offer').body =
      '把你在意的需求告訴我們，先了解服務內容，再討論適合的安排。實際項目與條件仍待品牌確認。'
  }
  return {
    schemaVersion: 'managed-site-studio-intelligence-v1',
    ...(context.chromeShape ? { chrome: context.chromeShape } : {}),
    strategy: {
      ...context.strategyShape,
      audience: '第一次認識這個品牌、想先了解服務的人（測試建議）',
      proposition: '先消除第一次接觸的猶豫，再給客人一個容易開始的選擇。',
      facts: [context.brief.slice(0, 80)],
      questions: [
        '客人第一次接觸時，最常擔心什麼？',
        '目前有哪些可以公開的服務細節？',
      ],
      recommendedPreset: 'bloom',
      designReason:
        '自然親近的色彩，搭配清楚的服務介紹與問答，讓第一次來的訪客從容了解。',
    },
    copy,
  }
}

export function studioModelFetch(
  mutate: (value: any, context: any) => unknown = value => value
): typeof fetch {
  return (async (_url: unknown, init: RequestInit) => {
    const payload = JSON.parse(String(init.body))
    const context = JSON.parse(
      payload.messages.find((message: any) => message.role === 'user').content
    )
    const response = mutate(studioModelResponse(context), context)
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                typeof response === 'string'
                  ? response
                  : JSON.stringify(response),
            },
            finish_reason: 'stop',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }) as typeof fetch
}
