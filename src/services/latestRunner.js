// Runs one task per key at a time. Starting a newer task aborts the older one's signal, and `cancel` aborts the
// current one, so a request that nobody is waiting for any more stops using the network.
export const createLatestRunner = (run) => {
  const active = new Map()

  const cancel = (key) => {
    active.get(key)?.abort()
    active.delete(key)
  }

  const runLatest = async (key, ...args) => {
    cancel(key)
    const controller = new AbortController()
    active.set(key, controller)

    try {
      return await run(controller.signal, ...args)
    } finally {
      if (active.get(key) === controller) active.delete(key)
    }
  }

  return { run: runLatest, cancel }
}
