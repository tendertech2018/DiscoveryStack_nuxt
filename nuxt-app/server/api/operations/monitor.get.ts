import { createError, defineEventHandler, getHeader, setResponseHeaders } from 'h3'
import { buildMonitorReport, monitorAuthorized } from '../../operations/monitor-report'

export default defineEventHandler(event => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store, max-age=0', 'x-robots-tag': 'noindex, nofollow, noarchive', 'referrer-policy': 'no-referrer' })
  if (!monitorAuthorized(getHeader(event, 'authorization'), process.env.DS_OPS_MONITOR_TOKEN)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const config = useRuntimeConfig(event) as { operationsTaskScheduleSnapshot?: unknown }
  return buildMonitorReport(process.env, config.operationsTaskScheduleSnapshot)
})
