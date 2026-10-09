import { format, inspect } from 'node:util'
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

  it('records a failure and rejects with a safe error for the scheduler logger without retrying', async () => {
    const failure = Object.assign(new Error('Failed query: insert private-content params: secret-recipient'), {
      query: 'insert private-content',
      params: ['secret-recipient'],
      providerReceipt: 'secret-receipt',
      cause: Object.assign(new Error('secret-provider-token'), { credential: 'secret-credential' }),
    })
    const callback = vi.fn(async () => { throw failure })
    const error = await runOperationsTask('weekly-content:tick', callback, {
      now: clock('2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.010Z'),
    }).then(() => { throw new Error('Expected rejection') }, error => error)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBe(failure)
    expect(error).toMatchObject({ name: 'OperationsTaskError', code: 'TASK_RUN_THROWN', message: 'Scheduled task failed (TASK_RUN_THROWN)' })
    for (const field of ['cause', 'query', 'params', 'providerReceipt', 'credential']) expect(error).not.toHaveProperty(field)
    const snapshot = getTaskHeartbeatSnapshot()
    expect(snapshot.heartbeats[0]).toMatchObject({ lastOutcome: 'failure', reasonCode: 'TASK_RUN_THROWN', consecutiveFailures: 1, activeRuns: 0 })
    const logged = format('Error while running scheduled task "%s"', 'weekly-content:tick', error)
    for (const value of ['private-content', 'secret-recipient', 'secret-receipt', 'secret-provider-token', 'secret-credential']) {
      expect(logged).not.toContain(value)
      expect(inspect(error, { showHidden: true, depth: null })).not.toContain(value)
      expect(JSON.stringify({ snapshot, error })).not.toContain(value)
    }
  })

  it.each([null, undefined, 'secret-string', { message: 'secret-object' }])('sanitizes arbitrary thrown values (%#)', async (failure) => {
    await expect(runOperationsTask('managed-sites:editor-tick', () => { throw failure })).rejects.toMatchObject({
      name: 'OperationsTaskError', code: 'TASK_RUN_THROWN', message: 'Scheduled task failed (TASK_RUN_THROWN)',
    })
    expect(getTaskHeartbeatSnapshot().heartbeats[0]).toMatchObject({ lastOutcome: 'failure', totalRuns: 1, activeRuns: 0 })
  })

  it('does not inspect a thrown object or invoke its custom formatter', async () => {
    const access = vi.fn(() => { throw new Error('secret-getter') })
    const failure = Object.defineProperties({}, {
      message: { get: access },
      cause: { get: access },
      [inspect.custom]: { get: access },
    })
    await expect(runOperationsTask('managed-sites:editor-tick', () => { throw failure })).rejects.toMatchObject({ code: 'TASK_RUN_THROWN' })
    expect(access).not.toHaveBeenCalled()
  })

  it('keeps counting failures and clears the failure streak only after success', async () => {
    const callback = vi.fn(() => { throw new Error('private') })
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(runOperationsTask('managed-sites:editor-tick', callback)).rejects.toMatchObject({ code: 'TASK_RUN_THROWN' })
    }
    expect(callback).toHaveBeenCalledTimes(2)
    expect(getTaskHeartbeatSnapshot().heartbeats[0]).toMatchObject({ totalRuns: 2, consecutiveFailures: 2, activeRuns: 0 })
    await runOperationsTask('managed-sites:editor-tick', () => ({ result: { status: 'idle' } }))
    expect(getTaskHeartbeatSnapshot().heartbeats[0]).toMatchObject({ totalRuns: 3, consecutiveFailures: 0, activeRuns: 0, lastOutcome: 'success', reasonCode: null })
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
