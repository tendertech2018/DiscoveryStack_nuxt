import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { readMonthlyVisibilityEvidence } from '../server/managed-sites/monthly-report-repository'
import { llmVisibilityProjects, llmVisibilityQueries, llmVisibilityObservations, llmVisibilityObservationReviews } from '../server/database/schema'
const state = vi.hoisted(() => ({ database: null as any }))
vi.mock('../server/database', () => ({ getDatabase: () => state.database }))
function fixture() {
  const reads: Array<{ table: any; where?: any; joins: any[]; limit?: number; projection?: any }> = []
  const data = new Map<any, any[]>([[llmVisibilityProjects, [{ id: 15 }]], [llmVisibilityQueries, [{ id: 2, promptText: 'Current', locale: 'en', active: true }]], [llmVisibilityObservations, [{ id: 3, queryId: 2, promptVersionId: 4, promptText: 'Original', locale: 'en', provider: 'chatgpt', observedAt: new Date('2026-09-05'), observationMode: 'manual_verified', brandMentioned: true, citationUrls: [] }]], [llmVisibilityObservationReviews, [{ observationId: 3, newStatus: 'approved' }, { observationId: 3, newStatus: 'revoked' }]]])
  const database: any = { select: (projection: any) => {
    const read: typeof reads[number] = { table: null, joins: [], projection }; reads.push(read)
    const query: any = { from: (table: any) => { read.table = table; return query }, where: (value: any) => { read.where = value; return query }, orderBy: () => query, innerJoin: (_: any, value: any) => { read.joins.push(value); return query }, leftJoin: (_: any, value: any) => { read.joins.push(value); return query }, limit: (limit: number) => { read.limit = limit; return Promise.resolve(data.get(read.table) || []) } }
    return query
  } }
  database.transaction = vi.fn(async (work: (db: any) => unknown, _options: unknown) => work(database))
  state.database = database
  return { data, reads, database, read: () => readMonthlyVisibilityEvidence(7, 15, 'brand.acme.taipei', new Date('2026-08-30'), new Date('2026-10-02')) }
}
beforeEach(() => { state.database = null })
describe('monthly report bounded, scoped read-only storage path', () => {
  it('uses a consistent read-only snapshot, exact owner/site joins and terminal revocation', async () => {
    const f = fixture(), evidence = await f.read()
    expect(evidence.observations[0]?.reviewStatus).toBe('revoked')
    expect(evidence.observations[0]?.promptText).toBe('Original')
    expect(f.database.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'repeatable read', accessMode: 'read only' })
    const dialect = new MySqlDialect(), observation = f.reads.find(read => read.table === llmVisibilityObservations)!
    for (const join of observation.joins) { const sql = dialect.sqlToQuery(join); expect(sql.sql).toContain('ownerUserId'); expect(sql.sql).toContain('projectId'); expect(sql.params).toEqual(expect.arrayContaining([7, 15])) }
    const scope = dialect.sqlToQuery(observation.where)
    expect(scope.params).toEqual(expect.arrayContaining([7, 15, 'completed', 'manual_verified']))
    for (const field of ['rawResponse', 'evidenceExcerpt', 'reviewerNote']) expect(Object.keys(observation.projection)).not.toContain(field)
    expect(observation.limit).toBe(2001)
  })
  it('fails closed on missing scope, excessive evidence, or missing immutable prompt identity', async () => {
    const f = fixture(); f.data.set(llmVisibilityProjects, [])
    await expect(f.read()).rejects.toMatchObject({ statusCode: 409 })
    f.data.set(llmVisibilityProjects, [{ id: 15 }]); f.data.set(llmVisibilityQueries, Array.from({ length: 501 }, () => ({})))
    await expect(f.read()).rejects.toMatchObject({ statusCode: 409 })
    f.data.set(llmVisibilityQueries, []); f.data.set(llmVisibilityObservations, [{ id: 3, promptVersionId: 4, promptText: null, citationUrls: [] }])
    await expect(f.read()).rejects.toMatchObject({ statusCode: 409 })
  })
  it('returns unavailable without connecting to a production database', async () => {
    await expect(readMonthlyVisibilityEvidence(7, 15, 'brand.acme.taipei', new Date(), new Date())).rejects.toMatchObject({ statusCode: 503 })
  })
})
