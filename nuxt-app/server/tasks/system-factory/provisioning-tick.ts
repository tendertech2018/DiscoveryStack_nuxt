import { executeProvisioningTask } from '../../system-factory/provisioning-task'
import { runOperationsTask } from '../../operations/task-heartbeats'

export default defineTask({
  meta: { name: 'system-factory:provisioning-tick', description: 'Bounded fail-closed system provisioning scheduler.' },
  async run() { return runOperationsTask('system-factory:provisioning-tick', async () => ({ result: await executeProvisioningTask({ enabled: process.env.NUXT_SYSTEM_FACTORY_EXECUTION_ENABLED === 'true' }) })) },
})
