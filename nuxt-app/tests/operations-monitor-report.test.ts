import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, toNodeListener } from 'h3'
import { createServer } from 'node:http'
import { buildMonitorReport, monitorAuthorized } from '../server/operations/monitor-report'
import { getOperationsTaskDefinitions } from '../server/operations/task-catalog'
import route from '../server/api/operations/monitor.get'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('read-only operations monitor boundary', () => {
  it.each([undefined, '', 'Bearer short', `Bearer ${'b'.repeat(64)}`, `Bearer ${'a'.repeat(64)}\n`])('rejects missing or incorrect bearer %s', header => {
    expect(monitorAuthorized(header, 'a'.repeat(64))).toBe(false)
  })
  it('requires a configured independent token and does not accept an owner cookie', () => {
    expect(monitorAuthorized(`Bearer ${'a'.repeat(64)}`, undefined)).toBe(false)
    expect(monitorAuthorized(`Bearer ${'a'.repeat(64)}`, 'a'.repeat(64))).toBe(true)
    expect(monitorAuthorized('owner_session=fixture', 'a'.repeat(64))).toBe(false)
  })
  it('returns only fixed status fields, not task payloads', () => {
    const report = buildMonitorReport({}, undefined, { processStartedAt: '2026-10-12T00:00:00Z', heartbeats: [] })
    expect(report).toEqual({ version: 1, status: 'FAIL', scheduler: 'awaiting_observation', evidence: 'process_local_heartbeats' })
    const definition = getOperationsTaskDefinitions({}).find(row => row.featureFlags.length)!
    const environment = Object.fromEntries(definition.featureFlags.map(flag => [flag, 'true']))
    expect(buildMonitorReport(environment, undefined, { processStartedAt: '2026-10-12T00:00:00Z', heartbeats: [] }).status).toBe('FAIL')
    const heartbeats = getOperationsTaskDefinitions({}).map(row => ({ taskName: row.name, activeRuns: 0, totalRuns: 1, consecutiveFailures: 0, lastStartedAt: '2026-10-12T00:00:00Z', lastCompletedAt: '2026-10-12T00:00:00Z', lastDurationMs: 1, lastOutcome: 'success' as const, reasonCode: null }))
    expect(buildMonitorReport({}, undefined, { processStartedAt: '2026-10-12T00:00:00Z', heartbeats }, Date.parse('2026-10-12T00:01:00Z')).status).toBe('PASS')
  })
  it('enforces authentication and no-store on the actual H3 handler', async () => {
    vi.stubEnv('DS_OPS_MONITOR_TOKEN', 'a'.repeat(64))
    vi.stubGlobal('useRuntimeConfig', () => ({}))
    const server = createServer(toNodeListener(createApp().use(route)))
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    try {
      const address = server.address() as { port: number }
      const url = `http://127.0.0.1:${address.port}/`
      const cases: Record<string, string>[] = [{}, { cookie: 'owner_session=fixture' }, { authorization: `Bearer ${'b'.repeat(64)}` }]
      for (const headers of cases) {
        const response = await fetch(url, { headers })
        expect(response.status).toBe(401)
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(await response.text()).not.toContain('a'.repeat(64))
      }
      const response = await fetch(url, { headers: { authorization: `Bearer ${'a'.repeat(64)}` } })
      expect(response.status).toBe(200)
      expect(Object.keys(await response.json()).sort()).toEqual(['evidence', 'scheduler', 'status', 'version'])
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
