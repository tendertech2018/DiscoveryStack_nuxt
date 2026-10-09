export type OperationsTaskName =
  | 'model-improvement:collect'
  | 'content-operations:geo-modelops-tick'
  | 'managed-sites:editor-tick'
  | 'managed-sites:provisioning-tick'
  | 'managed-sites:email-outbox-tick'
  | 'system-factory:provisioning-tick'
  | 'llm-visibility:benchmark-tick'
  | 'content-operations:tick'
  | 'content-operations:execution-tick'
  | 'content-operations:measurement-tick'
  | 'weekly-content:tick'
  | 'learning-loop:tick'

type Environment = Record<string, string | undefined>

type TaskDefinitionSource = {
  name: OperationsTaskName
  handlerPath: string
  cronEnvironment?: string
  defaultCron: string
  maxHeartbeatAgeMs: number
  featureFlags: readonly string[]
  featureMode?: 'all' | 'any'
}

export type OperationsTaskDefinition = TaskDefinitionSource & {
  cron: string
  enabled: boolean
}

const TASK_DEFINITIONS = [
  { name: 'model-improvement:collect', handlerPath: './server/tasks/model-improvement/collect.ts', cronEnvironment: 'MODEL_IMPROVEMENT_CRON', defaultCron: '0 18 * * *', maxHeartbeatAgeMs: 30 * 60 * 60_000, featureFlags: [] },
  { name: 'content-operations:geo-modelops-tick', handlerPath: './server/tasks/content-operations/geo-modelops-tick.ts', cronEnvironment: 'GEO_MODELOPS_CRON', defaultCron: '*/15 * * * *', maxHeartbeatAgeMs: 45 * 60_000, featureFlags: [] },
  { name: 'managed-sites:editor-tick', handlerPath: './server/tasks/managed-sites/editor-tick.ts', cronEnvironment: 'MANAGED_SITE_EDITOR_CRON', defaultCron: '*/5 * * * *', maxHeartbeatAgeMs: 20 * 60_000, featureFlags: [] },
  { name: 'managed-sites:provisioning-tick', handlerPath: './server/tasks/managed-sites/provisioning-tick.ts', cronEnvironment: 'MANAGED_SITE_PROVISIONING_CRON', defaultCron: '*/5 * * * *', maxHeartbeatAgeMs: 20 * 60_000, featureFlags: [] },
  { name: 'managed-sites:email-outbox-tick', handlerPath: './server/tasks/managed-site-email-outbox-tick.ts', cronEnvironment: 'MANAGED_SITE_EMAIL_OUTBOX_CRON', defaultCron: '*/1 * * * *', maxHeartbeatAgeMs: 10 * 60_000, featureFlags: ['NUXT_MANAGED_SITE_EMAIL_OUTBOX_ENABLED', 'NUXT_MANAGED_SITE_EMAIL_OUTBOX_RETENTION_ENABLED'], featureMode: 'any' },
  { name: 'system-factory:provisioning-tick', handlerPath: './server/tasks/system-factory/provisioning-tick.ts', cronEnvironment: 'SYSTEM_FACTORY_CRON', defaultCron: '*/5 * * * *', maxHeartbeatAgeMs: 20 * 60_000, featureFlags: ['NUXT_SYSTEM_FACTORY_EXECUTION_ENABLED'] },
  { name: 'llm-visibility:benchmark-tick', handlerPath: './server/tasks/llm-visibility-benchmark-tick.ts', cronEnvironment: 'LLM_VISIBILITY_BENCHMARK_CRON', defaultCron: '*/5 * * * *', maxHeartbeatAgeMs: 20 * 60_000, featureFlags: ['LLM_VISIBILITY_BENCHMARK_AUTO_RESUME'] },
  { name: 'content-operations:tick', handlerPath: './server/tasks/content-operations-tick.ts', cronEnvironment: 'CONTENT_OPERATIONS_CRON', defaultCron: '*/15 * * * *', maxHeartbeatAgeMs: 45 * 60_000, featureFlags: ['NUXT_CONTENT_OPERATIONS_SCHEDULER_ENABLED'] },
  { name: 'content-operations:execution-tick', handlerPath: './server/tasks/content-operations-execution-tick.ts', cronEnvironment: 'CONTENT_OPERATIONS_EXECUTION_CRON', defaultCron: '*/5 * * * *', maxHeartbeatAgeMs: 20 * 60_000, featureFlags: ['NUXT_CONTENT_OPERATIONS_SCHEDULER_ENABLED'] },
  { name: 'content-operations:measurement-tick', handlerPath: './server/tasks/content-operations/measurement-tick.ts', cronEnvironment: 'CONTENT_OPERATIONS_MEASUREMENT_CRON', defaultCron: '*/30 * * * *', maxHeartbeatAgeMs: 90 * 60_000, featureFlags: [] },
  { name: 'weekly-content:tick', handlerPath: './server/tasks/weekly-content-tick.ts', defaultCron: '*/5 * * * *', maxHeartbeatAgeMs: 20 * 60_000, featureFlags: ['NUXT_WEEKLY_CONTENT_APPROVAL_ENABLED', 'NUXT_CONTENT_OPERATIONS_SCHEDULER_ENABLED'], featureMode: 'all' },
  { name: 'learning-loop:tick', handlerPath: './server/tasks/learning-loop-tick.ts', defaultCron: '*/5 * * * *', maxHeartbeatAgeMs: 20 * 60_000, featureFlags: ['NUXT_LEARNING_LOOP_ENABLED', 'NUXT_LEARNING_RETENTION_ENABLED'], featureMode: 'any' },
] as const satisfies readonly TaskDefinitionSource[]

function featureEnabled(definition: TaskDefinitionSource, environment: Environment): boolean {
  const values = definition.featureFlags.map(flag => environment[flag] === 'true')
  return definition.featureMode === 'any' ? values.some(Boolean) : values.every(Boolean)
}

function snapshotCron(snapshot: unknown, name: OperationsTaskName): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>)[name]
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : null
}

export function getOperationsTaskDefinitions(environment: Environment = process.env, builtScheduleSnapshot?: unknown): OperationsTaskDefinition[] {
  return TASK_DEFINITIONS.map((definition) => {
    const source: TaskDefinitionSource = definition
    return {
      ...source,
      cron: snapshotCron(builtScheduleSnapshot, source.name) || (source.cronEnvironment ? environment[source.cronEnvironment] : '') || source.defaultCron,
      enabled: featureEnabled(source, environment),
    }
  })
}
