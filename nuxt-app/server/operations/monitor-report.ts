import { timingSafeEqual } from 'node:crypto'
import { getOperationsTaskDefinitions } from './task-catalog'
import { getTaskHeartbeatSnapshot } from './task-heartbeats'
import { operationsSchedulerStatus, operationsTaskRuntimeStatus } from './scheduler-readiness'

/** Read-only monitor credential. Never accepted by Owner or application mutation routes. */
export function monitorAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!/^[a-f0-9]{64}$/.test(secret || '') || !/^Bearer [a-f0-9]{64}$/.test(header || '')) return false
  return timingSafeEqual(Buffer.from(header!.slice(7), 'hex'), Buffer.from(secret!, 'hex'))
}

export function buildMonitorReport(environment: Record<string, string | undefined>, schedule: unknown, snapshot = getTaskHeartbeatSnapshot(), now = Date.now()) {
  const heartbeats = new Map(snapshot.heartbeats.map(row => [row.taskName, row]))
  const statuses = getOperationsTaskDefinitions(environment, schedule).map(definition => operationsTaskRuntimeStatus(definition, heartbeats.get(definition.name) || null, now))
  const scheduler = operationsSchedulerStatus(statuses)
  // No names, account identifiers, raw errors, credentials or task payloads.
  return { version: 1 as const, status: ['ready', 'disabled'].includes(scheduler) ? 'PASS' as const : 'FAIL' as const, scheduler, evidence: 'process_local_heartbeats' as const }
}
