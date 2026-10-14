import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:https', () => ({ request: mocks.request }))
import { analyseStudioReference, fetchStudioReferenceResource, referenceRobotsAllowsPath } from '../server/managed-sites/funnel/studio-reference'

function response(status = 200, body = '<html></html>', headers: Record<string, string> = { 'content-type': 'text/html' }) {
  mocks.request.mockImplementationOnce((_url: URL, _options: unknown, callback: (res: any) => void) => {
    const req = new EventEmitter() as any
    req.destroy = (error: Error) => { req.emit('error', error); req.emit('close') }
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter() as any
      Object.assign(res, { statusCode: status, headers, resume: vi.fn(), destroy: vi.fn() })
      callback(res)
      res.emit('data', Buffer.from(body)); res.emit('end'); req.emit('close')
    })
    return req
  })
}

describe('reference fetch socket admission — no real network', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]) })
  it('pins the real socket to the checked address and never sends credentials', async () => {
    response()
    await fetchStudioReferenceResource('https://example.com/', 1000, Date.now() + 1000)
    const [url, options] = mocks.request.mock.calls[0]!
    expect(url.hostname).toBe('example.com'); expect(options.agent).toBe(false); expect(options.method).toBe('GET')
    expect(options.headers).not.toHaveProperty('authorization'); expect(options.headers).not.toHaveProperty('cookie')
    const address = vi.fn(), addresses = vi.fn()
    options.lookup('example.com', {}, address); options.lookup('example.com', { all: true }, addresses)
    expect(address).toHaveBeenCalledWith(null, '8.8.8.8', 4)
    expect(addresses).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }])
  })
  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', 'fe80::1', '::ffff:127.0.0.1'])('rejects a mixed DNS answer containing %s before HTTP', async address => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }])
    await expect(fetchStudioReferenceResource('https://example.com/', 1000, Date.now() + 1000)).rejects.toThrow('reference_private_address')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('re-checks DNS on a redirect and rejects private addresses before the next socket', async () => {
    response(302, '', { location: 'https://other.example.com/' })
    mocks.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
    await expect(fetchStudioReferenceResource('https://example.com/', 1000, Date.now() + 1000)).rejects.toThrow('reference_private_address')
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('stops a robots-disallowed redirect before requesting the target', async () => {
    response(302, '', { location: '/private/style.css' })
    await expect(fetchStudioReferenceResource('https://example.com/style.css', 1000, Date.now() + 1000, url => !new URL(url).pathname.startsWith('/private'))).rejects.toThrow('reference_disallowed_redirect')
    expect(mocks.lookup).toHaveBeenCalledTimes(1); expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('enforces the deadline, body limit and safe content types', async () => {
    await expect(fetchStudioReferenceResource('https://example.com/', 100, Date.now() - 1)).rejects.toThrow('reference_timeout')
    expect(mocks.lookup).not.toHaveBeenCalled()
    response(200, 'x'.repeat(101))
    await expect(fetchStudioReferenceResource('https://example.com/', 100, Date.now() + 1000)).rejects.toThrow('reference_too_large')
    response(200, 'alert(1)', { 'content-type': 'application/javascript' })
    await expect(fetchStudioReferenceResource('https://example.com/', 1000, Date.now() + 1000)).rejects.toThrow('reference_content_type')
  })
})

describe('reference robots policy', () => {
  it.each([
    ['/private/page', false], ['/public/style.css', false], ['/public/style.css/other', true],
    ['/allowed.css', true], ['/images/你好', false], ['/about', true],
  ])('matches wildcard/end/UTF-8 rules for %s', (path, allowed) => {
    expect(referenceRobotsAllowsPath('User-agent: *\nDisallow: /private/\nDisallow: /*.css$\nAllow: /allowed.css$\nDisallow: /images/你好', path)).toBe(allowed)
  })
  it('does not read CSS paths disallowed by robots even when the page links to them', async () => {
    const fetchResource = vi.fn(async (url: string) => ({ url, status: 200, type: url.endsWith('robots.txt') ? 'text/plain' : 'text/html', body: url.endsWith('robots.txt') ? 'User-agent: *\nDisallow: /*.css$' : '<link rel="stylesheet" href="/private.css">' }))
    const result = await analyseStudioReference('https://example.com/', { fetchResource })
    expect(result.status).toBe('partial'); expect(fetchResource).toHaveBeenCalledTimes(2)
  })
})
