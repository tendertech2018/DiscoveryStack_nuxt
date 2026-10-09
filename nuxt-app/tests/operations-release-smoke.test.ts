import { describe, expect, it, vi } from 'vitest'
import { parseArguments, runReleaseSmoke, validateOrigin } from '../scripts/operations/release-smoke.mjs'

const SHA = 'a'.repeat(40)
function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
}
function fetcher(overrides: Record<string, () => Response> = {}) {
  return vi.fn<typeof fetch>(async (input, options) => {
    expect(options?.redirect).toBe('error')
    expect(options?.headers).not.toHaveProperty('cookie')
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = new URL(url).pathname
    if (overrides[path]) return overrides[path]()
    if (path === '/api/health') return response({ status: 'ok' })
    if (path === '/api/ready') return response({ status: 'ready', checks: { database: 'pass', migrations: 'pass' } })
    if (path === '/api/__release') return response({ handler: 'nitro', commit: SHA })
    return response({ error: 'Private administration requires an owner session.' }, 401)
  })
}

describe('deployment smoke CLI', () => {
  it('accepts only the same release, healthy database/schema, no-store and owner boundary', async () => {
    const result = await runReleaseSmoke({ origin: 'https://ops.example.com', expectedCommit: SHA, fetcher: fetcher() })
    expect(result).toMatchObject({ status: 'PASS', providerAcceptance: 'NOT_RUN', databaseMutation: false })
    expect(result.checks).toHaveLength(4)
  })
  it.each([
    ['/api/health', () => response({ status: 'ok' }, 200, { 'cache-control': 'public' })],
    ['/api/ready', () => response({ status: 'not_ready' }, 503)],
    ['/api/__release', () => response({ handler: 'nitro', commit: 'b'.repeat(40) })],
    ['/api/operations/readiness', () => response({ database: 'private' })],
    ['/api/health', () => response({ status: 'ok', DATABASE_URL: 'should-not-be-returned' })],
  ])('fails closed for %s', async (path, override) => {
    const result = await runReleaseSmoke({ origin: 'https://ops.example.com', expectedCommit: SHA, fetcher: fetcher({ [path]: override }) })
    expect(result.status).toBe('FAIL')
    expect(JSON.stringify(result)).not.toContain('should-not-be-returned')
  })
  it('rejects HTML fallback and network errors without retaining response bodies', async () => {
    const result = await runReleaseSmoke({ origin: 'https://ops.example.com', expectedCommit: SHA, fetcher: async () => new Response('<html>private content</html>') })
    expect(result.status).toBe('FAIL')
    expect(JSON.stringify(result)).not.toContain('private content')
  })
  it('requires a full deployment commit and permits not-ready only on loopback', () => {
    expect(() => parseArguments(['--origin', 'https://ops.example.com'])).toThrow('deployment_check_requires_expected_commit')
    expect(() => parseArguments(['--origin', 'https://ops.example.com', '--allow-not-ready-local'])).toThrow()
    expect(parseArguments(['--origin', 'http://127.0.0.1:3300', '--allow-not-ready-local'])).toMatchObject({ allowNotReady: true })
  })
  it.each(['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?token=secret'])('rejects unsafe origin %s', origin => {
    expect(() => validateOrigin(origin)).toThrow()
  })
})
