import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const driver = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('mysql2/promise', () => ({ default: { createConnection: driver.connect } }))
import { evaluateRuntimeReadiness, sanitizePublicReadiness } from '../server/operations/readiness'

const release = { marker: 'synthetic', commit: 'a'.repeat(40) }
beforeEach(() => { vi.stubEnv('DATABASE_URL', 'mysql://synthetic-user:synthetic-password@never-connect.invalid/test'); driver.connect.mockReset() })
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('real readiness probe with a fake SQL driver', () => {
  it.each(['ER_ACCESS_DENIED_ERROR', 'ENOTFOUND', 'CERT_HAS_EXPIRED'])('redacts %s and retains only stage and reason', async code => {
    driver.connect.mockRejectedValue(Object.assign(new Error('secret SQL and credentials'), { code, sql: 'private query', cause: new Error('private cause') }))
    const result = await evaluateRuntimeReadiness({ release })
    expect(result.database.stage).toBe('connect')
    expect(result.database.reasonCode).not.toBe('DATABASE_QUERY_FAILED')
    for (const secret of ['secret', 'private', 'synthetic-password', 'never-connect']) expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(sanitizePublicReadiness(result))).not.toContain(result.database.reasonCode!)
    expect(sanitizePublicReadiness(result)).not.toHaveProperty('database')
  })
  it('identifies missing ledger after health success and always closes the connection', async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ healthy: 1 }]]).mockRejectedValueOnce({ code: 'ER_NO_SUCH_TABLE', sql: 'secret ledger query' })
    const destroy = vi.fn()
    driver.connect.mockResolvedValue({ query, destroy })
    const result = await evaluateRuntimeReadiness({ release })
    expect(result.database).toMatchObject({ stage: 'ledger', reasonCode: 'MIGRATION_LEDGER_UNAVAILABLE' })
    expect(query).toHaveBeenCalledTimes(2); expect(destroy).toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('secret ledger query')
  })
  it('destroys a late connection without running SQL after a deadline', async () => {
    vi.useFakeTimers()
    let resolve!: (value: unknown) => void
    driver.connect.mockImplementation(() => new Promise(r => { resolve = r }))
    const query = vi.fn(), destroy = vi.fn()
    const pending = evaluateRuntimeReadiness({ release, timeoutMs: 10 })
    await vi.advanceTimersByTimeAsync(11)
    expect((await pending).database.reasonCode).toBe('DATABASE_CHECK_TIMEOUT')
    resolve({ query, destroy }); await vi.advanceTimersByTimeAsync(1)
    expect(destroy).toHaveBeenCalled(); expect(query).not.toHaveBeenCalled()
  })
})
