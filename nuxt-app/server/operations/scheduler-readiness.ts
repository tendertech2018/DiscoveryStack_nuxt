import type { OperationsTaskDefinition } from './task-catalog'
import type { TaskHeartbeat } from './task-heartbeats'

export type OperationsTaskRuntimeStatus =
  | 'disabled'
  | 'running'
  | 'running_unproven'
  | 'healthy'
  | 'not_observed'
  | 'stale'
  | 'failing'

export type OperationsSchedulerStatus = 'ready' | 'disabled' | 'awaiting_observation' | 'degraded'

function timestampAge(timestamp: string | null, nowMs: number): number {
  if (!timestamp) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : Number.POSITIVE_INFINITY
}

export function operationsTaskRuntimeStatus(
  definition: Pick<OperationsTaskDefinition, 'enabled' | 'maxHeartbeatAgeMs'>,
  heartbeat: TaskHeartbeat | null,
  nowMs = Date.now(),
): OperationsTaskRuntimeStatus {
  if (!definition.enabled) return 'disabled'
  if (!heartbeat) return 'not_observed'

  if (heartbeat.activeRuns > 0) {
    if (timestampAge(heartbeat.lastStartedAt, nowMs) > definition.maxHeartbeatAgeMs) return 'stale'
    if (heartbeat.lastOutcome === 'failure') return 'failing'
    if (heartbeat.lastOutcome !== 'success' || timestampAge(heartbeat.lastCompletedAt, nowMs) > definition.maxHeartbeatAgeMs) return 'running_unproven'
    return 'running'
  }

  if (heartbeat.lastOutcome === 'failure') return 'failing'
  if (heartbeat.lastOutcome === 'success') return timestampAge(heartbeat.lastCompletedAt, nowMs) > definition.maxHeartbeatAgeMs ? 'stale' : 'healthy'
  if (heartbeat.lastOutcome === 'disabled') return 'disabled'
  return 'not_observed'
}

export function operationsSchedulerStatus(statuses: readonly OperationsTaskRuntimeStatus[]): OperationsSchedulerStatus {
  const enabled = statuses.filter(status => status !== 'disabled')
  if (!enabled.length) return 'disabled'
  if (enabled.some(status => status === 'failing' || status === 'stale')) return 'degraded'
  if (enabled.some(status => status === 'not_observed' || status === 'running_unproven')) return 'awaiting_observation'
  return 'ready'
}
