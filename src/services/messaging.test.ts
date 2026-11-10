import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { COMMAND_MESSAGES, SENDER_ROLES, getSenderKey, getSenderRole } from './messaging.ts'

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

describe('sender roles', () => {
  const extensionUrl = 'chrome-extension://abc/'

  it('treats the popup and the settings tab as extension pages', () => {
    assert.equal(getSenderRole({ url: 'chrome-extension://abc/popup.html' }, extensionUrl), SENDER_ROLES.extensionPage)
    assert.equal(getSenderRole({ tab: { id: 3 }, url: 'chrome-extension://abc/options.html' }, extensionUrl), SENDER_ROLES.extensionPage)
  })

  it('treats a script running in a web page or its blank frames as a content script', () => {
    assert.equal(getSenderRole({ tab: { id: 42 }, frameId: 0, url: 'https://mail.google.com/' }, extensionUrl), SENDER_ROLES.contentScript)
    assert.equal(getSenderRole({ tab: { id: 42 }, frameId: 5, url: 'about:blank' }, extensionUrl), SENDER_ROLES.contentScript)
  })

  it('gives no role to anything else, including another extension', () => {
    assert.equal(getSenderRole({ url: 'chrome-extension://other/popup.html' }, extensionUrl), null)
    assert.equal(getSenderRole({}, extensionUrl), null)
    assert.equal(getSenderRole(undefined, extensionUrl), null)
  })
})
