import { createHash } from 'node:crypto'
import { getOperationsTaskDefinitions } from './task-catalog'

export type OperationsAlert = { code: 'DATABASE_NOT_READY' | 'TASK_FAILING' | 'TASK_STALE' | 'TASK_NOT_OBSERVED'; taskName: string | null; severity: 'critical' | 'warning'; deduplicationKey: string }

/** Reduced metadata for the owner UI or a future authorized notifier; never sends. */
export function buildOperationsAlertPlan(databaseReady: boolean, tasks: ReadonlyArray<{ name: string; status: string }>) {
  const alerts: OperationsAlert[] = []
  const append = (code: OperationsAlert['code'], taskName: string | null, severity: OperationsAlert['severity']) => {
    const deduplicationKey = createHash('sha256').update(JSON.stringify({ code, taskName })).digest('hex')
    if (!alerts.some(row => row.deduplicationKey === deduplicationKey)) alerts.push({ code, taskName, severity, deduplicationKey })
  }
  if (!databaseReady) append('DATABASE_NOT_READY', null, 'critical')
  const known = new Set<string>(getOperationsTaskDefinitions({}).map(task => task.name))
  for (const task of tasks) {
    if (!known.has(task.name)) continue
    if (task.status === 'failing') append('TASK_FAILING', task.name, 'critical')
    if (task.status === 'stale') append('TASK_STALE', task.name, 'warning')
    if (task.status === 'not_observed' || task.status === 'running_unproven') append('TASK_NOT_OBSERVED', task.name, 'warning')
  }
  return { alerts, deliveryStatus: 'not_configured' as const, externalNotificationSent: false as const }
}
