import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOperationsTaskLifecycle } from '../server/operations/task-lifecycle'
import { classifyTaskOutcome } from '../server/operations/task-heartbeats'

afterEach(() => vi.useRealTimers())
describe('bounded scheduler shutdown without replay', () => {
  it('stops new work synchronously, drains existing work and preserves its result', async () => {
    const lifecycle = createOperationsTaskLifecycle()
    let finish!: () => void
    const provider = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const running = lifecycle.run(provider)
    const drained = lifecycle.drain()
    const rejected = vi.fn()
    await expect(lifecycle.run(rejected)).rejects.toMatchObject({ code: 'TASK_DRAINING' })
    expect(rejected).not.toHaveBeenCalled()
    expect(lifecycle.snapshot()).toEqual({ draining: true, activeRuns: 1 })
    finish(); await running
    expect(await drained).toEqual({ drained: true, remainingRuns: 0 })
    expect(provider).toHaveBeenCalledTimes(1)
  })
  it('times out without cancelling, acknowledging, or repeating an uncertain operation', async () => {
    vi.useFakeTimers()
    const lifecycle = createOperationsTaskLifecycle()
    let finish!: () => void
    const provider = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const running = lifecycle.run(provider)
    const drained = lifecycle.drain(20)
    await vi.advanceTimersByTimeAsync(20)
    expect(await drained).toEqual({ drained: false, remainingRuns: 1 })
    expect(provider).toHaveBeenCalledTimes(1)
    await expect(lifecycle.run(provider)).rejects.toMatchObject({ code: 'TASK_DRAINING' })
    finish(); await running
    expect(await lifecycle.drain()).toEqual({ drained: true, remainingRuns: 0 })
  })
  it('releases its in-process count after errors and allows independent restarted process state', async () => {
    const lifecycle = createOperationsTaskLifecycle()
    await expect(lifecycle.run(() => { throw new Error('synthetic failure') })).rejects.toThrow('synthetic failure')
    expect(await lifecycle.drain()).toEqual({ drained: true, remainingRuns: 0 })
    expect(await createOperationsTaskLifecycle().run(() => 'fresh process')).toBe('fresh process')
  })
  it.each([{ status: 'completed', failed: 1 }, { result: { status: 'completed', failed: 2 } }, { result: { counts: { failed: 1 } } }])('does not report a mixed failure as successful %j', result => {
    expect(classifyTaskOutcome(result)).toEqual({ outcome: 'failure', reasonCode: 'TASK_PARTIAL_FAILURE' })
  })
})
