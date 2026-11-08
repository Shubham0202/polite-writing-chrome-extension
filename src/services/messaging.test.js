import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { COMMAND_MESSAGES, getSenderKey } from './messaging.js'

const { commands } = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'))

describe('keyboard shortcuts', () => {
  it('sends a message to the page for every command in the manifest, and no other', () => {
    assert.deepEqual(Object.keys(COMMAND_MESSAGES).sort(), Object.keys(commands).sort())
  })
})

describe('sender keys', () => {
  it('tells tabs, frames and extension pages apart', () => {
    assert.equal(getSenderKey({ tab: { id: 42 }, frameId: 0, url: 'https://mail.google.com/' }), '42:0')
    assert.equal(getSenderKey({ tab: { id: 42 }, frameId: 7 }), '42:7')
    assert.equal(getSenderKey({ url: 'chrome-extension://abc/popup.html' }), '/popup.html')
    assert.equal(getSenderKey({ url: 'chrome-extension://abc/options.html' }), '/options.html')
    assert.equal(getSenderKey({}), 'extension-page')
    assert.equal(getSenderKey(undefined), 'extension-page')
  })
})
