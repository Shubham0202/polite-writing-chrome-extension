import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { setImmediate as flushPromises } from 'node:timers/promises'
import { FIELD_KINDS } from './fieldEligibility.js'
import { createTextChangeDetector } from './textChangeDetector.js'

const DELAY_MS = 1000

const createField = (value = '') => Object.assign(new EventTarget(), { value })
const edit = (field, value, eventType = 'input') => {
  field.value = value
  field.dispatchEvent(new Event(eventType))
}

// Records every report. With finishImmediately off, a report's work only finishes when the test calls finish().
const createRecorder = ({ finishImmediately = true } = {}) => {
  const reports = []
  const onTextReady = (report) =>
    new Promise((resolve) => {
      reports.push({ ...report, finish: resolve })
      if (finishImmediately) resolve()
    })
  return { reports, texts: () => reports.map((report) => report.text), onTextReady }
}

const watchNewField = (recorderOptions, value) => {
  const recorder = createRecorder(recorderOptions)
  const detector = createTextChangeDetector({ onTextReady: recorder.onTextReady })
  const field = createField(value)
  detector.watch(field, FIELD_KINDS.input)
  return { ...recorder, detector, field }
}

describe('text change detector', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }))
  afterEach(() => mock.timers.reset())

  it('reports the text once typing pauses, not on every keystroke', () => {
    const { field, texts } = watchNewField()
    for (const value of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      edit(field, value)
      mock.timers.tick(DELAY_MS - 1)
    }
    assert.deepEqual(texts(), [])
    mock.timers.tick(1)
    assert.deepEqual(texts(), ['Hello'])
  })

  it('does not report text that was already checked', async () => {
    const { detector, field, texts } = watchNewField()
    edit(field, 'Hello')
    mock.timers.tick(DELAY_MS)
    await flushPromises()

    edit(field, 'Hello!')
    edit(field, 'Hello')
    mock.timers.tick(DELAY_MS)
    detector.unwatch()
    detector.watch(field, FIELD_KINDS.input)
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Hello'])
  })

  it('checks text again when its check could not run', async () => {
    const texts = []
    const onTextReady = async ({ text }) => {
      texts.push(text)
      return texts.length === 1 ? false : undefined
    }
    const detector = createTextChangeDetector({ onTextReady })
    const field = createField('Hello')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      detector.watch(field, FIELD_KINDS.input)
      mock.timers.tick(DELAY_MS)
      await flushPromises()
      detector.unwatch()
    }
    assert.deepEqual(texts, ['Hello', 'Hello'])
  })

  it('aborts work on outdated text as soon as the text changes', () => {
    const { field, reports, texts } = watchNewField({ finishImmediately: false })
    edit(field, 'Hello')
    mock.timers.tick(DELAY_MS)
    edit(field, 'Hello there')
    assert.equal(reports[0].signal.aborted, true)

    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Hello', 'Hello there'])
    assert.equal(reports[1].signal.aborted, false)
  })

  it('checks the text again when its work was cut short by leaving the field', async () => {
    const { detector, field, reports, texts } = watchNewField({ finishImmediately: false })
    edit(field, 'Hello')
    mock.timers.tick(DELAY_MS)
    detector.unwatch()
    assert.equal(reports[0].signal.aborted, true)
    reports[0].finish()
    await flushPromises()

    detector.watch(field, FIELD_KINDS.input)
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Hello', 'Hello'])
  })

  it('counts text as checked only once its work has finished', async () => {
    const { detector, field, reports, texts } = watchNewField({ finishImmediately: false })
    edit(field, 'Hello')
    mock.timers.tick(DELAY_MS)
    reports[0].finish()
    await flushPromises()

    detector.unwatch()
    detector.watch(field, FIELD_KINDS.input)
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Hello'])
    assert.equal(reports[0].signal.aborted, false)
  })

  it('waits until an input method composition ends', () => {
    const { field, texts } = watchNewField()
    field.dispatchEvent(new Event('compositionstart'))
    edit(field, 'nam')
    mock.timers.tick(DELAY_MS * 3)
    assert.deepEqual(texts(), [])

    field.value = 'namaste'
    field.dispatchEvent(new Event('compositionend'))
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['namaste'])
  })

  it('notices text that a site pastes in itself, without an input event', () => {
    const { field, texts } = watchNewField()
    edit(field, 'Pasted sentence. Another one.', 'paste')
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Pasted sentence. Another one.'])
  })

  it('checks text already in a field when it gains focus, but not an empty field', () => {
    const { detector, texts } = watchNewField({}, 'Existing draft')
    mock.timers.tick(DELAY_MS)
    detector.watch(createField(''), FIELD_KINDS.input)
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Existing draft'])
  })

  it('cancels a pending check when the field is left', () => {
    const { detector, field, texts } = watchNewField()
    edit(field, 'Hello')
    mock.timers.tick(DELAY_MS / 2)
    detector.unwatch()
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), [])
  })

  it('stops listening to the previous field when another one is watched', () => {
    const { detector, field: firstField, texts } = watchNewField()
    edit(firstField, 'First')
    const secondField = createField()
    detector.watch(secondField, FIELD_KINDS.input)
    edit(firstField, 'First again')
    edit(secondField, 'Second')
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Second'])
  })

  it('reports every change right away for work that cannot wait', () => {
    let changes = 0
    const field = createField()
    createTextChangeDetector({ onTextReady: () => {}, onTextChanged: () => (changes += 1) }).watch(field, FIELD_KINDS.input)
    edit(field, 'H')
    edit(field, 'He')
    assert.equal(changes, 3, 'once on focus and once per edit')
  })

  it('uses the configured delay, as it is at that moment', () => {
    const { reports, onTextReady } = createRecorder()
    const field = createField()
    let delayMs = 300
    createTextChangeDetector({ onTextReady, getDelayMs: () => delayMs }).watch(field, FIELD_KINDS.input)
    edit(field, 'Quick')
    mock.timers.tick(300)
    assert.equal(reports.length, 1)

    delayMs = 2000
    edit(field, 'Slower')
    mock.timers.tick(1999)
    assert.equal(reports.length, 1)
    mock.timers.tick(1)
    assert.equal(reports.length, 2)
  })

  it('checks unchanged text again on request', async () => {
    const { detector, field, texts } = watchNewField()
    edit(field, 'Hello')
    mock.timers.tick(DELAY_MS)
    await flushPromises()

    detector.recheck()
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), ['Hello', 'Hello'])
  })

  it('does nothing on a recheck while no field is watched', () => {
    const { detector, field, texts } = watchNewField()
    detector.unwatch()
    field.value = 'Hello'
    detector.recheck()
    mock.timers.tick(DELAY_MS)
    assert.deepEqual(texts(), [])
  })
})
