import { describe, expect, it } from 'vitest'
import { operationsSchedulerStatus, operationsTaskRuntimeStatus } from '../server/operations/scheduler-readiness'
import type { TaskHeartbeat } from '../server/operations/task-heartbeats'

const nowMs = Date.parse('2030-01-01T01:00:00.000Z')
const definition = { enabled: true, maxHeartbeatAgeMs: 20 * 60_000 }
const heartbeat = (overrides: Partial<TaskHeartbeat> = {}): TaskHeartbeat => ({
  taskName: 'weekly-content:tick',
  activeRuns: 0,
  totalRuns: 1,
  consecutiveFailures: 0,
  lastStartedAt: '2030-01-01T00:55:00.000Z',
  lastCompletedAt: '2030-01-01T00:56:00.000Z',
  lastDurationMs: 60_000,
  lastOutcome: 'success',
  reasonCode: null,
  ...overrides,
})

describe('owner scheduler readiness projection', () => {
  it('keeps a fresh run ready only when this process already observed a recent success', () => {
    expect(operationsTaskRuntimeStatus(definition, heartbeat({ activeRuns: 1 }), nowMs)).toBe('running')
    expect(operationsSchedulerStatus(['running'])).toBe('ready')

    const firstRun = heartbeat({ activeRuns: 1, totalRuns: 0, lastCompletedAt: null, lastOutcome: null })
    expect(operationsTaskRuntimeStatus(definition, firstRun, nowMs)).toBe('running_unproven')
    expect(operationsSchedulerStatus(['running_unproven'])).toBe('awaiting_observation')
  })

  it('fails stale when an active run exceeds its bounded heartbeat age', () => {
    const hung = heartbeat({ activeRuns: 1, lastStartedAt: '2030-01-01T00:30:00.000Z' })
    expect(operationsTaskRuntimeStatus(definition, hung, nowMs)).toBe('stale')
    expect(operationsSchedulerStatus(['stale'])).toBe('degraded')
  })

  it('does not let failures or missing observations appear ready', () => {
    expect(operationsTaskRuntimeStatus(definition, heartbeat({ lastOutcome: 'failure' }), nowMs)).toBe('failing')
    expect(operationsTaskRuntimeStatus(definition, null, nowMs)).toBe('not_observed')
    expect(operationsSchedulerStatus(['healthy', 'not_observed'])).toBe('awaiting_observation')
    expect(operationsSchedulerStatus(['healthy', 'failing'])).toBe('degraded')
    expect(operationsSchedulerStatus(['disabled', 'disabled'])).toBe('disabled')
  })
})
