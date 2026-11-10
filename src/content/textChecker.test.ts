import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { setImmediate as flushPromises } from 'node:timers/promises'
import { MAX_TEXT_LENGTH } from '../constants/corrections.ts'
import type { InlineCheckResult } from '../services/correctionPipeline.ts'
import { MESSAGE_TYPES, type RequestMessage } from '../services/messaging.ts'
import { createTextChecker } from './textChecker.ts'

// Only the parts of a result the checker passes on matter here.
const RESULT = { suggestions: [], toneAlternatives: {}, engines: [] } as unknown as InlineCheckResult

interface RecordedMessage extends RequestMessage {
  respond: (data: InlineCheckResult) => void
  reject: (error: Error) => void
}

interface CheckerCalls {
  results: InlineCheckResult[]
  empties: number
  rejections: string[]
  failures: string[]
  disconnects: number
}

// The extension API is not part of Node's globals, so the tests put their stand-in there through this view.
const testGlobal: { chrome?: unknown } = globalThis

// Stands in for the extension API; each sent message stays open until the test answers it.
const installChrome = (): RecordedMessage[] => {
  const messages: RecordedMessage[] = []
  testGlobal.chrome = {
    runtime: {
      id: 'extension-id',
      sendMessage: (message: RequestMessage) =>
        new Promise((resolve, reject) => {
          messages.push({ ...message, respond: (data) => resolve({ ok: true, data }), reject })
        }),
    },
  }
  return messages
}

const createRecorder = () => {
  const calls: CheckerCalls = { results: [], empties: 0, rejections: [], failures: [], disconnects: 0 }
  const check = createTextChecker({
    onResult: (result) => calls.results.push(result),
    onEmpty: () => {
      calls.empties += 1
    },
    onRejected: (reason) => calls.rejections.push(reason),
    onFailed: (reason) => calls.failures.push(reason),
    onDisconnected: () => {
      calls.disconnects += 1
    },
  })
  return { calls, check }
}

describe('text checker', () => {
  let messages: RecordedMessage[]

  beforeEach(() => {
    messages = installChrome()
  })

  afterEach(() => {
    delete testGlobal.chrome
  })

  it('sends the text to the service worker and reports the result', async () => {
    const { calls, check } = createRecorder()
    const running = check({ text: 'Hello there.', signal: new AbortController().signal })
    assert.equal(messages[0].type, MESSAGE_TYPES.runInlineCheck)
    assert.deepEqual(messages[0].payload, { text: 'Hello there.' })

    messages[0].respond(RESULT)
    await running
    assert.deepEqual(calls.results, [RESULT])
  })

  it('sends nothing for empty or too-long text', async () => {
    const { calls, check } = createRecorder()
    await check({ text: '  \n ', signal: new AbortController().signal })
    await check({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1), signal: new AbortController().signal })
    assert.equal(messages.length, 0)
    assert.equal(calls.empties, 1)
    assert.equal(calls.rejections.length, 1)
  })

  it('tells the service worker to cancel, and drops the result, when the text changes', async () => {
    const { calls, check } = createRecorder()
    const controller = new AbortController()
    const running = check({ text: 'Hello there.', signal: controller.signal })
    controller.abort()
    assert.equal(messages[1].type, MESSAGE_TYPES.cancelInlineCheck)

    messages[0].respond(RESULT)
    await running
    assert.deepEqual(calls.results, [])
  })

  it('does not send a cancel after the check has finished', async () => {
    const { check } = createRecorder()
    const controller = new AbortController()
    const running = check({ text: 'Hello there.', signal: controller.signal })
    messages[0].respond(RESULT)
    await running
    controller.abort()
    await flushPromises()
    assert.equal(messages.length, 1)
  })

  it('resolves to false when the check could not run, so the text can be checked again', async () => {
    const { check } = createRecorder()
    const outcome = check({ text: 'Hello', signal: new AbortController().signal })
    await flushPromises()
    messages[0].reject(new Error('Something went wrong.'))
    assert.equal(await outcome, false)
  })

  it('does not resolve to false for a finished, empty or too-long check', async () => {
    const { check } = createRecorder()
    const finished = check({ text: 'Hello', signal: new AbortController().signal })
    await flushPromises()
    messages[0].respond(RESULT)
    assert.notEqual(await finished, false)
    assert.notEqual(await check({ text: '  ', signal: new AbortController().signal }), false)
    assert.notEqual(await check({ text: 'x'.repeat(MAX_TEXT_LENGTH + 1), signal: new AbortController().signal }), false)
  })

  it('reports a failed check', async () => {
    const { calls, check } = createRecorder()
    const running = check({ text: 'Hello there.', signal: new AbortController().signal })
    messages[0].reject(new Error('Worker crashed'))
    await running
    assert.deepEqual(calls.failures, ['The background service is not available. Close and reopen the popup to try again.'])
    assert.equal(calls.disconnects, 0)
  })

  it('reports being cut off when the extension was reloaded or removed', async () => {
    const { calls, check } = createRecorder()
    const running = check({ text: 'Hello there.', signal: new AbortController().signal })
    delete (testGlobal.chrome as { runtime: { id?: string } }).runtime.id
    messages[0].reject(new Error('Extension context invalidated.'))
    await running
    assert.equal(calls.disconnects, 1)
    assert.deepEqual(calls.failures, [])
  })
})
