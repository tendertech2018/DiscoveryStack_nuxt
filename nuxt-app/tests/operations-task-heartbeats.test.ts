import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyTaskOutcome, getTaskHeartbeatSnapshot, resetTaskHeartbeatsForTests, runOperationsTask } from '../server/operations/task-heartbeats'

function clock(...values: string[]) {
  let index = 0
  return () => new Date(values[Math.min(index++, values.length - 1)]!)
}

describe('operations task heartbeats', () => {
  beforeEach(() => resetTaskHeartbeatsForTests())

  it('records actual success and disabled results without changing task authority', async () => {
    const success = await runOperationsTask('content-operations:tick', async () => ({ result: { status: 'completed', processed: 2 } }), {
      now: clock('2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.025Z'),
    })
    expect(success.result.processed).toBe(2)
    expect(getTaskHeartbeatSnapshot().heartbeats[0]).toMatchObject({ lastOutcome: 'success', lastDurationMs: 25, totalRuns: 1, consecutiveFailures: 0 })

    const callback = vi.fn(async () => ({ result: { status: 'disabled' as const, processed: 0 } }))
    await runOperationsTask('content-operations:tick', callback, {
      now: clock('2030-01-01T00:01:00.000Z', '2030-01-01T00:01:00.005Z'),
    })
    expect(callback).toHaveBeenCalledTimes(1)
    expect(getTaskHeartbeatSnapshot().heartbeats[0]).toMatchObject({ lastOutcome: 'disabled', reasonCode: 'TASK_FEATURE_DISABLED', totalRuns: 2 })
  })

  it('records a sanitized failure heartbeat and rethrows the original error', async () => {
    const failure = Object.assign(new Error('provider secret and recipient must never enter heartbeat state'), { providerReceipt: 'private' })
    await expect(runOperationsTask('weekly-content:tick', async () => { throw failure }, {
      now: clock('2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.010Z'),
    })).rejects.toBe(failure)
    const snapshot = getTaskHeartbeatSnapshot()
    expect(snapshot.heartbeats[0]).toMatchObject({ lastOutcome: 'failure', reasonCode: 'TASK_RUN_THROWN', consecutiveFailures: 1, activeRuns: 0 })
    expect(JSON.stringify(snapshot)).not.toContain('provider secret')
    expect(JSON.stringify(snapshot)).not.toContain('private')
  })

  it('classifies returned operational failures separately from disabled and successful runs', () => {
    expect(classifyTaskOutcome({ result: { status: 'not_configured' } })).toEqual({ outcome: 'failure', reasonCode: 'TASK_NOT_CONFIGURED' })
    expect(classifyTaskOutcome({ result: { status: 'disabled' } })).toEqual({ outcome: 'disabled', reasonCode: 'TASK_FEATURE_DISABLED' })
    expect(classifyTaskOutcome({ result: { enabled: false } })).toEqual({ outcome: 'disabled', reasonCode: 'TASK_FEATURE_DISABLED' })
    expect(classifyTaskOutcome({ result: { status: 'idle' } })).toEqual({ outcome: 'success', reasonCode: null })
    const cyclic: Record<string, unknown> = {}
    cyclic.result = { result: cyclic }
    expect(classifyTaskOutcome(cyclic)).toEqual({ outcome: 'success', reasonCode: null })
  })
})
