import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { getPageHostname, getSiteAdapter } from './siteAdapters.js'

describe('page hostname', () => {
  afterEach(() => {
    delete globalThis.location
  })

  it('uses the page itself when it is the top frame', () => {
    globalThis.location = { ancestorOrigins: [], hostname: 'mail.google.com' }
    assert.equal(getPageHostname(), 'mail.google.com')
  })

  it('follows the top page from inside a frame', () => {
    globalThis.location = { ancestorOrigins: ['https://frame.example.com', 'https://mail.google.com'], hostname: '' }
    assert.equal(getPageHostname(), 'mail.google.com')
  })

  it('matches no site when the top page has an opaque origin', () => {
    globalThis.location = { ancestorOrigins: ['null'], hostname: 'mail.google.com' }
    assert.equal(getPageHostname(), '')
  })
})

describe('site adapters', () => {
  it('leaves quoted text out on Gmail', () => {
    assert.match(getSiteAdapter('mail.google.com').excludedSelector, /gmail_quote/)
  })

  it('checks rich text with spellcheck off on Gmail and Google Chat', () => {
    for (const hostname of ['mail.google.com', 'chat.google.com']) {
      assert.equal(getSiteAdapter(hostname).checksRichTextWithSpellcheckOff, true, hostname)
    }
  })

  it('checks rich text with writing assistants turned off on every Atlassian site, and not on look-alikes', () => {
    for (const hostname of ['medarch.atlassian.net', 'example.atlassian.net']) {
      assert.equal(getSiteAdapter(hostname).checksRichTextWithAssistantsOff, true, hostname)
    }
    for (const hostname of ['atlassian.net', 'notatlassian.net', 'example.atlassian.net.evil.com']) {
      assert.deepEqual(getSiteAdapter(hostname), {}, hostname)
    }
  })

  it('adds nothing on sites that generic handling already covers', () => {
    for (const hostname of ['web.whatsapp.com', 'www.linkedin.com', 'constructor', '', undefined]) {
      assert.deepEqual(getSiteAdapter(hostname), {}, hostname)
    }
  })
})
