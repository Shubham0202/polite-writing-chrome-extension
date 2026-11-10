// Runs one task per key at a time. Starting a newer task aborts the older one's signal, and `cancel` aborts the
// current one, so a request that nobody is waiting for any more stops using the network.
export interface LatestRunner<Arguments extends unknown[], Result> {
  run: (key: string, ...args: Arguments) => Promise<Result>
  cancel: (key: string) => void
}

export const createLatestRunner = <Arguments extends unknown[], Result>(
  run: (signal: AbortSignal, ...args: Arguments) => Promise<Result>,
): LatestRunner<Arguments, Result> => {
  const active = new Map<string, AbortController>()

  const cancel = (key: string): void => {
    active.get(key)?.abort()
    active.delete(key)
  }

  const runLatest = async (key: string, ...args: Arguments): Promise<Result> => {
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
