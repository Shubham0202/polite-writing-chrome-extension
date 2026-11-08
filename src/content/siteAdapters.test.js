import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getSiteAdapter } from './siteAdapters.js'

describe('site adapters', () => {
  it('leaves quoted text out on Gmail', () => {
    assert.match(getSiteAdapter('mail.google.com').excludedSelector, /gmail_quote/)
  })

  it('checks rich text with spellcheck off on Gmail and Google Chat', () => {
    for (const hostname of ['mail.google.com', 'chat.google.com']) {
      assert.equal(getSiteAdapter(hostname).checksRichTextWithSpellcheckOff, true, hostname)
    }
  })

  it('adds nothing on sites that generic handling already covers', () => {
    for (const hostname of ['web.whatsapp.com', 'www.linkedin.com', 'example.atlassian.net', 'constructor', undefined]) {
      assert.deepEqual(getSiteAdapter(hostname), {}, hostname)
    }
  })
})
