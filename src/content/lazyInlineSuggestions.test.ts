import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { IdentifiedSuggestion } from '../engines/suggestion.ts'
import type { InlineCheckResult } from '../services/correctionPipeline.ts'
import { MESSAGE_TYPES, type RequestMessage } from '../services/messaging.ts'
import type { AiShortcutConfig } from './inlineSuggestionManager.ts'
import { createLazyInlineSuggestions } from './lazyInlineSuggestions.ts'

// Only the parts of a result and a suggestion that decide whether there is something to show matter here.
const EMPTY_RESULT = { suggestions: [], toneAlternatives: { polite: [], professional: [] } } as unknown as InlineCheckResult
const RESULT_WITH_MISTAKE = { ...EMPTY_RESULT, suggestions: [{ id: 'spelling-0' }] as IdentifiedSuggestion[] }
const RESULT_WITH_REWRITE = { ...EMPTY_RESULT, toneAlternatives: { polite: [{ id: 'polite-0' }], professional: [] } as unknown as InlineCheckResult['toneAlternatives'] }
const FIELD = {} as HTMLElement

interface FakeRuntime {
  sendMessage: (message?: RequestMessage) => Promise<unknown>
}

// The extension API and the injected UI are not part of Node's globals, so the tests put their stand-ins there
// through this view.
const testGlobal: { chrome?: unknown; writeBetterInlineUi?: unknown } = globalThis
const getRuntime = (): FakeRuntime => (testGlobal.chrome as { runtime: FakeRuntime }).runtime

const createManager = () => {
  const calls: unknown[][] = []
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push([name, ...args])
  return {
    calls,
    attach: record('attach'),
    detach: record('detach'),
    showResult: record('showResult'),
    showNotice: record('showNotice'),
    setAiShortcut: record('setAiShortcut'),
    setCloseOnAccept: record('setCloseOnAccept'),
    setColorScheme: record('setColorScheme'),
    openAllFromKeyboard: record('openAllFromKeyboard'),
    isOwnElement: () => true,
  }
}

describe('lazy inline suggestions', () => {
  let messages: string[]
  let manager: ReturnType<typeof createManager>

  beforeEach(() => {
    messages = []
    manager = createManager()
    testGlobal.chrome = {
      runtime: {
        sendMessage: async (message: RequestMessage) => {
          messages.push(message.type)
          testGlobal.writeBetterInlineUi = manager
          return { ok: true }
        },
      },
    }
  })

  afterEach(() => {
    delete testGlobal.chrome
    delete testGlobal.writeBetterInlineUi
  })

  const createLazy = (onUnavailable: (reason: string) => void = () => {}) => createLazyInlineSuggestions({ onUnavailable })

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
    assert.equal(lazy.isOwnElement({} as Node), false)
  })

  it('loads the UI for the first suggestion and connects it to the active field', async () => {
    const lazy = createLazy()
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(messages, [MESSAGE_TYPES.loadInlineUi])
    assert.deepEqual(manager.calls, [['attach', FIELD, 'textarea'], ['showResult', RESULT_WITH_MISTAKE]])
    assert.equal(lazy.isOwnElement({} as Node), true)
  })

  it('loads the UI for the shortcut while AI rewriting is on, and hands it the AI settings first', async () => {
    const lazy = createLazy()
    const aiShortcut: AiShortcutConfig = { isEnabled: true, style: 'polite', isConfigured: true, onToggle: () => {}, onStyleChange: () => {}, onOpenSettings: () => {} }
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

  it('hands the UI the theme when it loads, so it is never drawn in the wrong colours, and every change after that', async () => {
    const lazy = createLazy()
    lazy.setColorScheme('dark')
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(manager.calls.slice(0, 2), [['setColorScheme', 'dark'], ['attach', FIELD, 'textarea']])
    lazy.setColorScheme('light')
    assert.deepEqual(manager.calls.at(-1), ['setColorScheme', 'light'])
  })

  it('leaves the UI unloaded for the shortcut while AI rewriting is off, or no field is active', async () => {
    const lazy = createLazy()
    lazy.setAiShortcut({ isEnabled: false, style: 'polite', isConfigured: true, onToggle: () => {}, onStyleChange: () => {}, onOpenSettings: () => {} })
    lazy.attach(FIELD, 'textarea')
    await lazy.openAllFromKeyboard()
    lazy.detach()
    lazy.setAiShortcut({ isEnabled: true, style: 'polite', isConfigured: true, onToggle: () => {}, onStyleChange: () => {}, onOpenSettings: () => {} })
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
    const reasons: string[] = []
    const lazy = createLazy((reason) => reasons.push(reason))
    const { sendMessage } = getRuntime()
    getRuntime().sendMessage = async () => ({ ok: false, error: 'Injection refused.' })
    lazy.attach(FIELD, 'textarea')
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(reasons, ['Injection refused.'])

    getRuntime().sendMessage = sendMessage
    await lazy.showResult(RESULT_WITH_MISTAKE)
    assert.deepEqual(manager.calls.at(-1), ['showResult', RESULT_WITH_MISTAKE])
  })
})
