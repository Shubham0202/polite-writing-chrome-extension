import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MESSAGE_TYPES } from '../services/messaging.js'
import { createLazyInlineSuggestions } from './lazyInlineSuggestions.js'

const EMPTY_RESULT = { suggestions: [], toneAlternatives: { polite: [], professional: [] } }
const RESULT_WITH_MISTAKE = { ...EMPTY_RESULT, suggestions: [{ id: 'spelling-0' }] }
const RESULT_WITH_REWRITE = { ...EMPTY_RESULT, toneAlternatives: { polite: [{ id: 'polite-0' }], professional: [] } }
const FIELD = {}

const createManager = () => {
  const calls = []
  const record = (name) => (...args) => calls.push([name, ...args])
  return {
    calls,
    attach: record('attach'),
    detach: record('detach'),
    showResult: record('showResult'),
    showNotice: record('showNotice'),
    setAiShortcut: record('setAiShortcut'),
    setCloseOnAccept: record('setCloseOnAccept'),
    openAllFromKeyboard: record('openAllFromKeyboard'),
    isOwnElement: () => true,
  }
}

describe('lazy inline suggestions', () => {
  let messages
  let manager

  beforeEach(() => {
    messages = []
    manager = createManager()
    globalThis.chrome = {
      runtime: {
        sendMessage: async (message) => {
          messages.push(message.type)
          globalThis.writeBetterInlineUi = manager
          return { ok: true }
        },
      },
    }
  })

  afterEach(() => {
    delete globalThis.chrome
    delete globalThis.writeBetterInlineUi
  })

  const createLazy = (onUnavailable = () => {}) => createLazyInlineSuggestions({ onUnavailable })

  it('loads nothing while there is nothing to show', async () => {
    const lazy = createLazy()
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(EMPTY_RESULT)
    lazy.handleTextChanged()
    lazy.openFromKeyboard()
    lazy.openAllFromKeyboard()
    lazy.clear()
    lazy.detach()
    lazy.destroy()
    assert.deepEqual(messages, [])
    assert.equal(lazy.isOwnElement({}), false)
  })

  it('loads the UI for the first suggestion and connects it to the active field', async () => {
    const lazy = createLazy()
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(messages, [MESSAGE_TYPES.loadInlineUi])
    assert.deepEqual(manager.calls, [['attach', FIELD, 'textarea'], ['showResult', RESULT_WITH_MISTAKE]])
    assert.equal(lazy.isOwnElement({}), true)
  })

  it('loads the UI for the shortcut while AI rewriting is on, and hands it the AI settings first', async () => {
    const lazy = createLazy()
    const aiShortcut = { isEnabled: true, style: 'polite', onToggle: () => {} }
    lazy.setAiShortcut(aiShortcut)
    lazy.attach(FIELD, 'textarea')
    await lazy.openAllFromKeyboard()
    assert.deepEqual(messages, [MESSAGE_TYPES.loadInlineUi])
    assert.deepEqual(manager.calls, [['setAiShortcut', aiShortcut], ['attach', FIELD, 'textarea'], ['openAllFromKeyboard']])
  })

  it('hands the UI the Close after Accept switch when it loads, and every change after that', async () => {
    const lazy = createLazy()
    const closeOnAccept = { isEnabled: true, onToggle: () => {} }
    lazy.setCloseOnAccept(closeOnAccept)
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(manager.calls.slice(0, 2), [['setCloseOnAccept', closeOnAccept], ['attach', FIELD, 'textarea']])
    const switchedOff = { isEnabled: false, onToggle: () => {} }
    lazy.setCloseOnAccept(switchedOff)
    assert.deepEqual(manager.calls.at(-1), ['setCloseOnAccept', switchedOff])
  })

  it('leaves the UI unloaded for the shortcut while AI rewriting is off, or no field is active', async () => {
    const lazy = createLazy()
    lazy.setAiShortcut({ isEnabled: false, style: 'polite', onToggle: () => {} })
    lazy.attach(FIELD, 'textarea')
    await lazy.openAllFromKeyboard()
    lazy.detach()
    lazy.setAiShortcut({ isEnabled: true, style: 'polite', onToggle: () => {} })
    await lazy.openAllFromKeyboard()
    assert.deepEqual(messages, [])
  })

  it('loads the UI for a rewrite too, since the badge offers it', async () => {
    const lazy = createLazy()
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_REWRITE)
    assert.deepEqual(messages, [MESSAGE_TYPES.loadInlineUi])
  })

  it('loads the UI only once, even when results arrive close together', async () => {
    const lazy = createLazy()
    lazy.attach(FIELD, 'textarea')
    await Promise.all([lazy.showResult(RESULT_WITH_MISTAKE), lazy.showResult(RESULT_WITH_REWRITE)])
    assert.deepEqual(messages, [MESSAGE_TYPES.loadInlineUi])
    assert.equal(manager.calls.filter(([name]) => name === 'attach').length, 1)
  })

  it('passes later results on, so the UI can clear old suggestions', async () => {
    const lazy = createLazy()
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_MISTAKE)
    await lazy.showResult(EMPTY_RESULT)
    assert.deepEqual(manager.calls.at(-1), ['showResult', EMPTY_RESULT])
  })

  it('does not attach a field the user has already left', async () => {
    const lazy = createLazy()
    lazy.attach(FIELD, 'textarea')
    lazy.detach()
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.equal(manager.calls.filter(([name]) => name === 'attach').length, 0)
  })

  it('reports a failed load, and tries again next time', async () => {
    const reasons = []
    const lazy = createLazy((reason) => reasons.push(reason))
    const { sendMessage } = globalThis.chrome.runtime
    globalThis.chrome.runtime.sendMessage = async () => ({ ok: false, error: 'Injection refused.' })
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(reasons, ['Injection refused.'])

    globalThis.chrome.runtime.sendMessage = sendMessage
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(manager.calls.at(-1), ['showResult', RESULT_WITH_MISTAKE])
  })
})
