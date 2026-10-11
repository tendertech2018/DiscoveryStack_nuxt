import { operationsTaskLifecycle } from '../operations/task-lifecycle'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', async () => {
    const result = await operationsTaskLifecycle.drain()
    // Never release durable leases or retry ambiguous provider side effects here.
    // Recovery uses each existing job's lease/receipt protocol after restart.
    if (!result.drained) console.warn('OPERATIONS_DRAIN_TIMEOUT')
  })
})
