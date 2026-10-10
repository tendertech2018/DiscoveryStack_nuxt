import { describe, expect, it } from 'vitest'
import { getOperationsTaskDefinitions } from '../server/operations/task-catalog'

function schedules(env: Record<string, string> = {}): Record<string, string[]> {
  const registered: Record<string, string[]> = {}
  for (const task of getOperationsTaskDefinitions(env)) (registered[task.cron] ||= []).push(task.name)
  return registered
}

const configurableCronKeys = ['MODEL_IMPROVEMENT_CRON', 'GEO_MODELOPS_CRON', 'MANAGED_SITE_EDITOR_CRON', 'MANAGED_SITE_PROVISIONING_CRON', 'MANAGED_SITE_EMAIL_OUTBOX_CRON', 'SYSTEM_FACTORY_CRON', 'CONTENT_OPERATIONS_MEASUREMENT_CRON', 'CONTENT_OPERATIONS_CRON', 'CONTENT_OPERATIONS_EXECUTION_CRON', 'LLM_VISIBILITY_BENCHMARK_CRON']
const originalTasks = ['model-improvement:collect', 'content-operations:geo-modelops-tick', 'managed-sites:editor-tick', 'managed-sites:provisioning-tick', 'managed-sites:email-outbox-tick', 'system-factory:provisioning-tick', 'llm-visibility:benchmark-tick', 'content-operations:tick', 'content-operations:execution-tick', 'content-operations:measurement-tick']
const weeklyTask = 'weekly-content:tick'
const learningTask = 'learning-loop:tick'
const weeklyDefaultCron = '*/5 * * * *'
const emailOutboxDefaultCron = '*/1 * * * *'

describe('actual Nuxt scheduled task registration', () => {
  it('retains all original tasks and weekly scanning at the actual default cadences', () => {
    const registered = schedules()
    expect(registered[weeklyDefaultCron]).toEqual(['managed-sites:editor-tick', 'managed-sites:provisioning-tick', 'system-factory:provisioning-tick', 'llm-visibility:benchmark-tick', 'content-operations:execution-tick', weeklyTask, learningTask])
    expect(registered['*/15 * * * *']).toEqual(['content-operations:geo-modelops-tick', 'content-operations:tick'])
    expect(registered['*/30 * * * *']).toEqual(['content-operations:measurement-tick'])
    expect(registered['0 18 * * *']).toEqual(['model-improvement:collect'])
    expect(registered[emailOutboxDefaultCron]).toEqual(['managed-sites:email-outbox-tick'])
    expect(Object.values(registered).flat().sort()).toEqual([...originalTasks, weeklyTask, learningTask].sort())
  })
  it('retains every precise task identity when configured schedules coincide with the fixed weekly cron', () => {
    const env = Object.fromEntries(configurableCronKeys.map(key => [key, weeklyDefaultCron]))
    const registered = schedules(env)
    expect(Object.keys(registered)).toEqual([weeklyDefaultCron])
    expect(registered[weeklyDefaultCron]).toEqual([...originalTasks, weeklyTask, learningTask])
    expect(new Set(registered[weeklyDefaultCron]).size).toBe(originalTasks.length + 2)
  })
  it('keeps the fixed five-minute weekly scan separate when all configurable tasks move to another cron', () => {
    const configuredCron = '*/10 * * * *'
    const env = Object.fromEntries(configurableCronKeys.map(key => [key, configuredCron]))
    const registered = schedules(env)
    expect(Object.keys(registered)).toEqual([configuredCron, weeklyDefaultCron])
    expect(registered[configuredCron]).toEqual(originalTasks)
    expect(registered[weeklyDefaultCron]).toEqual([weeklyTask, learningTask])
    expect(Object.values(registered).flat().sort()).toEqual([...originalTasks, weeklyTask, learningTask].sort())
  })
  it('reports the build-time cron snapshot even if runtime cron env later drifts', () => {
    const built = getOperationsTaskDefinitions({ CONTENT_OPERATIONS_CRON: '*/10 * * * *' })
    const snapshot = Object.fromEntries(built.map(task => [task.name, task.cron]))
    const runtime = getOperationsTaskDefinitions({ CONTENT_OPERATIONS_CRON: '*/2 * * * *', NUXT_CONTENT_OPERATIONS_SCHEDULER_ENABLED: 'true' }, snapshot)
    expect(runtime.find(task => task.name === 'content-operations:tick')).toMatchObject({ cron: '*/10 * * * *', enabled: true })
  })
})
