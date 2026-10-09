import type { OperationsTaskName } from './task-catalog'

export type TaskHeartbeatOutcome = 'success' | 'failure' | 'disabled'

export type TaskHeartbeat = {
  taskName: OperationsTaskName
  activeRuns: number
  totalRuns: number
  consecutiveFailures: number
  lastStartedAt: string | null
  lastCompletedAt: string | null
  lastDurationMs: number | null
  lastOutcome: TaskHeartbeatOutcome | null
  reasonCode: string | null
}

type MutableTaskHeartbeat = TaskHeartbeat

type TaskHeartbeatRegistry = {
  processStartedAt: string
  heartbeats: Map<OperationsTaskName, MutableTaskHeartbeat>
}

const REGISTRY_KEY = Symbol.for('discoverystack.operations.task-heartbeats.v1')
const runtimeGlobal = globalThis as typeof globalThis & Record<symbol, unknown>
const registry = (runtimeGlobal[REGISTRY_KEY] as TaskHeartbeatRegistry | undefined) || {
  processStartedAt: new Date().toISOString(),
  heartbeats: new Map<OperationsTaskName, MutableTaskHeartbeat>(),
}
runtimeGlobal[REGISTRY_KEY] = registry
const heartbeats = registry.heartbeats

const FAILURE_STATUSES = new Set(['blocked', 'deferred', 'error', 'failed', 'failure', 'invalid_budget', 'not_configured', 'owner_not_configured', 'owner_unavailable', 'unconfigured'])

function heartbeatFor(taskName: OperationsTaskName): MutableTaskHeartbeat {
  const existing = heartbeats.get(taskName)
  if (existing) return existing
  const created: MutableTaskHeartbeat = {
    taskName,
    activeRuns: 0,
    totalRuns: 0,
    consecutiveFailures: 0,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastDurationMs: null,
    lastOutcome: null,
    reasonCode: null,
  }
  heartbeats.set(taskName, created)
  return created
}

function resultStatus(value: unknown, depth = 0): string | null {
  if (depth > 3 || !value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.status === 'string') return record.status.toLowerCase()
  if (record.enabled === false) return 'disabled'
  return record.result === value ? null : resultStatus(record.result, depth + 1)
}

export function classifyTaskOutcome(value: unknown): { outcome: TaskHeartbeatOutcome, reasonCode: string | null } {
  const status = resultStatus(value)
  if (status === 'disabled') return { outcome: 'disabled', reasonCode: 'TASK_FEATURE_DISABLED' }
  if (status && FAILURE_STATUSES.has(status)) return { outcome: 'failure', reasonCode: `TASK_${status.toUpperCase()}` }
  return { outcome: 'success', reasonCode: null }
}

function completeHeartbeat(taskName: OperationsTaskName, startedAtMs: number, outcome: TaskHeartbeatOutcome, reasonCode: string | null, now: () => Date) {
  const heartbeat = heartbeatFor(taskName)
  const completedAt = now()
  heartbeat.activeRuns = Math.max(0, heartbeat.activeRuns - 1)
  heartbeat.totalRuns += 1
  heartbeat.lastCompletedAt = completedAt.toISOString()
  heartbeat.lastDurationMs = Math.max(0, completedAt.getTime() - startedAtMs)
  heartbeat.lastOutcome = outcome
  heartbeat.reasonCode = reasonCode
  heartbeat.consecutiveFailures = outcome === 'failure' ? heartbeat.consecutiveFailures + 1 : 0
}

export async function runOperationsTask<T>(
  taskName: OperationsTaskName,
  run: () => Promise<T> | T,
  options: { now?: () => Date } = {},
): Promise<T> {
  const now = options.now || (() => new Date())
  const heartbeat = heartbeatFor(taskName)
  const startedAt = now()
  const startedAtMs = startedAt.getTime()
  heartbeat.activeRuns += 1
  heartbeat.lastStartedAt = startedAt.toISOString()

  try {
    const result = await run()
    const classified = classifyTaskOutcome(result)
    completeHeartbeat(taskName, startedAtMs, classified.outcome, classified.reasonCode, now)
    return result
  } catch (error) {
    completeHeartbeat(taskName, startedAtMs, 'failure', 'TASK_RUN_THROWN', now)
    throw error
  }
}

export function getTaskHeartbeatSnapshot(): { processStartedAt: string, heartbeats: TaskHeartbeat[] } {
  return {
    processStartedAt: registry.processStartedAt,
    heartbeats: [...heartbeats.values()].map(heartbeat => ({ ...heartbeat })),
  }
}

/** Test-only seam. Runtime callers should treat heartbeat state as process-local and append-only. */
export function resetTaskHeartbeatsForTests() {
  heartbeats.clear()
}
