import { getOperationsTaskDefinitions } from '../../operations/task-catalog'
import { getTaskHeartbeatSnapshot } from '../../operations/task-heartbeats'
import { getCachedRuntimeReadiness } from '../../operations/readiness'
import { resolveOperationsReleaseIdentity } from '../../operations/release'
import { operationsSchedulerStatus, operationsTaskRuntimeStatus } from '../../operations/scheduler-readiness'
import { requireOwner } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'cache-control': 'private, no-store, max-age=0',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    'referrer-policy': 'no-referrer',
  })
  await requireOwner(event)

  const config = useRuntimeConfig(event) as { operationsBuildCommit?: unknown, operationsTaskScheduleSnapshot?: unknown }
  const release = resolveOperationsReleaseIdentity(typeof config.operationsBuildCommit === 'string' ? config.operationsBuildCommit : '')
  const database = await getCachedRuntimeReadiness({ release })
  // Cron registration is fixed when Nitro is built. Feature flags remain runtime
  // authority, while this snapshot prevents runtime env drift from misreporting cadence.
  const definitions = getOperationsTaskDefinitions(process.env, config.operationsTaskScheduleSnapshot)
  const snapshot = getTaskHeartbeatSnapshot()
  const heartbeatByName = new Map(snapshot.heartbeats.map(heartbeat => [heartbeat.taskName, heartbeat]))
  const nowMs = Date.now()
  const tasks = definitions.map((definition) => {
    const heartbeat = heartbeatByName.get(definition.name) || null
    const status = operationsTaskRuntimeStatus(definition, heartbeat, nowMs)
    return {
      name: definition.name,
      cron: definition.cron,
      maxHeartbeatAgeMs: definition.maxHeartbeatAgeMs,
      feature: {
        enabled: definition.enabled,
        flags: definition.featureFlags.map(name => ({ name, enabled: process.env[name] === 'true' })),
        mode: definition.featureMode || 'all',
      },
      status,
      heartbeat,
    }
  })
  const schedulerStatus = operationsSchedulerStatus(tasks.map(task => task.status))

  return {
    status: database.status === 'ready' && ['ready', 'disabled'].includes(schedulerStatus) ? 'ready' : 'not_ready',
    checkedAt: new Date().toISOString(),
    database,
    scheduler: {
      status: schedulerStatus,
      processStartedAt: snapshot.processStartedAt,
      tasks,
    },
    limitations: [
      'Task heartbeats are process-local and reset when this server process restarts.',
      'This endpoint performs read-only database checks and does not call payment, email, storage, publishing or model providers.',
      'An enabled task remains not_observed until this process has seen a run.',
    ],
  }
})
