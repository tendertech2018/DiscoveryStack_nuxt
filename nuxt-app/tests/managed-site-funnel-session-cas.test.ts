import { describe, expect, it, vi } from 'vitest'
import { funnelSessionRevision, makeFunnelSessionRepository } from '../server/managed-sites/funnel/session-repository'

function fixture() {
  const row: any = { id: 7, status: 'active', answers: { company: { brandName: 'Brand', whatWeDo: 'Service' } }, consentSnapshot: null, currentStep: 2, previewId: null, projectId: null, releaseId: null }
  const lock = vi.fn(async () => [structuredClone(row)])
  const write = vi.fn(async () => [{ affectedRows: 1 }])
  const select = () => ({ from: () => ({ where: () => ({ limit: () => Object.assign(Promise.resolve([structuredClone(row)]), { for: lock }) }) }) })
  const transaction = vi.fn(async (work: any) => work({ select, update: () => ({ set: (patch: any) => ({ where: () => { Object.assign(row, structuredClone(patch)); return write() } }) }) }))
  return { row, lock, write, transaction, repository: makeFunnelSessionRepository({ transaction }) }
}

describe('database-backed funnel content compare-and-swap', () => {
  it('locks the row and compares canonical JSON independent of database key ordering', async () => {
    const f = fixture(), revision = funnelSessionRevision(f.row)
    f.row.answers.company = { whatWeDo: 'Service', brandName: 'Brand' }
    expect(await f.repository.transitionSession(7, 'active', { currentStep: 3 }, revision)).toMatchObject({ currentStep: 3 })
    expect(f.transaction).toHaveBeenCalledTimes(1)
    expect(f.lock).toHaveBeenCalledWith('update')
    expect(f.write).toHaveBeenCalledTimes(1)
  })
  it.each(['answers', 'consent', 'step', 'status', 'project'] as const)('does not write a stale %s snapshot', async changed => {
    const f = fixture(), revision = funnelSessionRevision(f.row)
    if (changed === 'answers') f.row.answers.company.whatWeDo = 'New content'
    if (changed === 'consent') f.row.consentSnapshot = { accepted: true }
    if (changed === 'step') f.row.currentStep++
    if (changed === 'status') f.row.status = 'building'
    if (changed === 'project') f.row.projectId = 123
    expect(await f.repository.transitionSession(7, 'active', { answers: {} }, revision)).toBeNull()
    expect(f.write).not.toHaveBeenCalled()
  })
})
