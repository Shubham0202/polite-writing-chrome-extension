import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { matchesShortcut, type KeyPress } from './shortcutFallback.ts'

const { commands } = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'))

const NO_MODIFIERS = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }

const press = (code: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({ code, ...NO_MODIFIERS, ...modifiers })

describe('shortcut fallback', () => {
  it('recognises the default key of every command in the manifest', () => {
    assert.equal(matchesShortcut(press('Space', { ctrlKey: true, shiftKey: true }), commands['open-all-suggestions'].suggested_key.default, false), true)
    assert.equal(matchesShortcut(press('KeyG', { altKey: true, shiftKey: true }), commands['open-suggestion'].suggested_key.default, false), true)
  })

  it('needs exactly the modifiers of the shortcut', () => {
    assert.equal(matchesShortcut(press('Space', { ctrlKey: true }), 'Ctrl+Shift+Space', false), false)
    assert.equal(matchesShortcut(press('Space', { ctrlKey: true, shiftKey: true, altKey: true }), 'Ctrl+Shift+Space', false), false)
    assert.equal(matchesShortcut(press('KeyG', { altKey: true }), 'Alt+Shift+G', false), false)
  })

  it('needs the same key', () => {
    assert.equal(matchesShortcut(press('KeyH', { altKey: true, shiftKey: true }), 'Alt+Shift+G', false), false)
    assert.equal(matchesShortcut(press('Enter', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Space', false), false)
  })

  it('names digits and arrows as manifest shortcuts do', () => {
    assert.equal(matchesShortcut(press('Digit5', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+5', false), true)
    assert.equal(matchesShortcut(press('ArrowUp', { altKey: true }), 'Alt+Up', false), true)
  })

  it('reads Ctrl as the Command key on a Mac, and MacCtrl as Control', () => {
    assert.equal(matchesShortcut(press('Space', { metaKey: true, shiftKey: true }), 'Ctrl+Shift+Space', true), true)
    assert.equal(matchesShortcut(press('Space', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Space', true), false)
    assert.equal(matchesShortcut(press('Space', { ctrlKey: true, shiftKey: true }), 'MacCtrl+Shift+Space', true), true)
  })
})
