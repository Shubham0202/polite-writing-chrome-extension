import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLatestRunner } from './latestRunner.ts'

// Each run stays open until the test finishes it.
interface Run {
  signal: AbortSignal
  args: unknown[]
  finish: () => void
}

const createRuns = () => {
  const runs: Run[] = []
  const run = (signal: AbortSignal, ...args: unknown[]) =>
    new Promise<unknown[]>((resolve) => {
      runs.push({ signal, args, finish: () => resolve(args) })
    })
  return { runs, run }
}

describe('latest runner', () => {
  it('passes the arguments after the key through, with a fresh signal', async () => {
    const { runs, run } = createRuns()
    const result = createLatestRunner(run).run('popup', { text: 'Hello' }, 'extra')
    assert.deepEqual(runs[0].args, [{ text: 'Hello' }, 'extra'])
    assert.equal(runs[0].signal.aborted, false)
    runs[0].finish()
    assert.deepEqual(await result, [{ text: 'Hello' }, 'extra'])
  })

  it('aborts the older run of the same key, and leaves other keys alone', () => {
    const { runs, run } = createRuns()
    const runner = createLatestRunner(run)
    runner.run('a', 1)
    runner.run('b', 2)
    runner.run('a', 3)
    assert.deepEqual(runs.map(({ signal }) => signal.aborted), [true, false, false])
  })

  it('cancels the current run, but not one that already finished', async () => {
    const { runs, run } = createRuns()
    const runner = createLatestRunner(run)
    const first = runner.run('a', 1)
    runs[0].finish()
    await first
    runner.cancel('a')
    assert.equal(runs[0].signal.aborted, false)

    runner.run('a', 2)
    runner.cancel('a')
    assert.equal(runs[1].signal.aborted, true)
  })
})
