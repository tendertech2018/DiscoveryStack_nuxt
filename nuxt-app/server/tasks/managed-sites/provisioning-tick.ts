import { advanceEligibleManagedSiteProvisioning } from '../../managed-sites/live-connectors/provision-advancer'
import { advancePaidManagedSiteFunnel } from '../../managed-sites/funnel/fulfilment-advancer'
import { runOperationsTask } from '../../operations/task-heartbeats'

let funnelAfterId = 0
export default defineTask({
  meta: { name: 'managed-sites:provisioning-tick', description: 'Bounded managed-site preview, ownership, and paid funnel fulfilment advancement.' },
  async run() {
    return runOperationsTask('managed-sites:provisioning-tick', async () => {
      const result = await advanceEligibleManagedSiteProvisioning({ limit: 20 })
      const funnel = await advancePaidManagedSiteFunnel({ afterId: funnelAfterId, limit: 20 })
      funnelAfterId = funnel.nextAfterId
      return { result: { ...result, funnel } }
    })
  },
})
