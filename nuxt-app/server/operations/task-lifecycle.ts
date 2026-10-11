/** Process-local drain only. Durable leases and provider reconciliation remain authoritative. */
export function createOperationsTaskLifecycle() {
  let draining = false
  let active = 0
  const idleListeners = new Set<() => void>()
  return {
    snapshot: () => ({ draining, activeRuns: active }),
    async run<T>(work: () => Promise<T> | T): Promise<T> {
      if (draining) throw Object.assign(new Error('Scheduled tasks are draining.'), { code: 'TASK_DRAINING' })
      active++
      try { return await work() }
      finally {
        active--
        if (active === 0) for (const listener of [...idleListeners]) listener()
      }
    },
    async drain(timeoutMs = 20_000): Promise<{ drained: boolean; remainingRuns: number }> {
      draining = true
      if (active === 0) return { drained: true, remainingRuns: 0 }
      const boundedTimeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(25_000, timeoutMs)) : 20_000
      return new Promise(resolve => {
        const finish = () => { clearTimeout(timer); idleListeners.delete(finish); resolve({ drained: active === 0, remainingRuns: active }) }
        const timer = setTimeout(finish, boundedTimeout)
        idleListeners.add(finish)
      })
    },
  }
}

const key = Symbol.for('discoverystack.operations.task-lifecycle.v1')
const runtime = globalThis as typeof globalThis & Record<symbol, unknown>
export const operationsTaskLifecycle = (runtime[key] ||= createOperationsTaskLifecycle()) as ReturnType<typeof createOperationsTaskLifecycle>
