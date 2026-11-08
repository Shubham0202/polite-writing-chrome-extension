import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CORRECTION_ACTIONS } from '../constants/corrections.js'
import { createInlineCheckRunner } from './inlineCheckRunner.js'

// Each pipeline run stays open until the test finishes it.
const createPipeline = () => {
  const runs = []
  const runPipeline = (request) =>
    new Promise((resolve) => {
      runs.push({ ...request, finish: () => resolve(request.text) })
    })
  return { runs, runPipeline }
}

describe('inline check runner', () => {
  it('runs the inline check action and returns its result', async () => {
    const { runs, runPipeline } = createPipeline()
    const check = createInlineCheckRunner(runPipeline).run('tab-1', 'Hello')
    assert.equal(runs[0].action, CORRECTION_ACTIONS.inlineCheck)
    runs[0].finish()
    assert.equal(await check, 'Hello')
  })

  it('aborts the older check when the same sender starts a newer one', () => {
    const { runs, runPipeline } = createPipeline()
    const inlineChecks = createInlineCheckRunner(runPipeline)
    inlineChecks.run('tab-1', 'Hello')
    inlineChecks.run('tab-1', 'Hello there')
    assert.equal(runs[0].signal.aborted, true)
    assert.equal(runs[1].signal.aborted, false)
  })

  it('keeps checks from different senders apart', () => {
    const { runs, runPipeline } = createPipeline()
    const inlineChecks = createInlineCheckRunner(runPipeline)
    inlineChecks.run('tab-1', 'Hello')
    inlineChecks.run('tab-2', 'Hello there')
    assert.equal(runs[0].signal.aborted, false)
  })

  it('cancels a running check on request', () => {
    const { runs, runPipeline } = createPipeline()
    const inlineChecks = createInlineCheckRunner(runPipeline)
    inlineChecks.run('tab-1', 'Hello')
    inlineChecks.cancel('tab-1')
    assert.equal(runs[0].signal.aborted, true)
  })

  it('does not abort a check that already finished', async () => {
    const { runs, runPipeline } = createPipeline()
    const inlineChecks = createInlineCheckRunner(runPipeline)
    const check = inlineChecks.run('tab-1', 'Hello')
    runs[0].finish()
    await check
    inlineChecks.cancel('tab-1')
    assert.equal(runs[0].signal.aborted, false)
  })

  it('lets an aborted check finish without disturbing the newer one', async () => {
    const { runs, runPipeline } = createPipeline()
    const inlineChecks = createInlineCheckRunner(runPipeline)
    const olderCheck = inlineChecks.run('tab-1', 'Hello')
    inlineChecks.run('tab-1', 'Hello there')
    runs[0].finish()
    await olderCheck
    inlineChecks.cancel('tab-1')
    assert.equal(runs[1].signal.aborted, true)
  })
})
