import { runScheduledBenchmarkTick } from '../llm-visibility/benchmark-scheduler'
import { runOperationsTask } from '../operations/task-heartbeats'

export default defineTask({
  meta: {
    name: 'llm-visibility:benchmark-tick',
    description: 'Opt-in owner-scoped recovery of one previously approved benchmark, with at most five single-attempt probes.',
  },
  async run() { return runOperationsTask('llm-visibility:benchmark-tick', async () => ({ result: await runScheduledBenchmarkTick() })) },
})
