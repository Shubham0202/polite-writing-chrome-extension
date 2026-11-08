import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DEFAULT_SETTINGS } from '../constants/settings.js'
import {
  getSettings,
  getSiteRows,
  isAssistanceActive,
  isSiteListed,
  isSitePaused,
  normalizeSettings,
  onSettingsChanged,
  parseSiteInput,
  setSitePaused,
  toMatchPattern,
  updateSettings,
} from './settings.js'

const settingsWith = (changes) => normalizeSettings(changes)

describe('settings', () => {
  describe('storage', () => {
    let stored
    let listeners

    beforeEach(() => {
      stored = {}
      listeners = []
      globalThis.chrome = {
        storage: {
          local: {
            get: async (key) => (key in stored ? { [key]: stored[key] } : {}),
            set: async (values) => Object.assign(stored, values),
          },
          onChanged: {
            addListener: (listener) => listeners.push(listener),
            removeListener: (listener) => listeners.splice(listeners.indexOf(listener), 1),
          },
        },
      }
    })

    afterEach(() => {
      delete globalThis.chrome
    })

    it('starts with everything on and a 1 second delay', async () => {
      assert.deepEqual(await getSettings(), DEFAULT_SETTINGS)
      assert.equal(DEFAULT_SETTINGS.delayMs, 1000)
    })

    it('keeps other settings when one changes', async () => {
      await updateSettings({ isSpellingEnabled: false })
      await updateSettings({ delayMs: 2000 })
      const settings = await getSettings()
      assert.equal(settings.isSpellingEnabled, false)
      assert.equal(settings.delayMs, 2000)
      assert.equal(settings.isGrammarEnabled, true)
    })

    it('fills in settings added after the user last saved', async () => {
      stored.settings = { delayMs: 2000 }
      assert.equal((await getSettings()).isPoliteEnabled, true)
    })

    it('reports changes with both values, and stops when asked', () => {
      const calls = []
      const stop = onSettingsChanged((settings, previous) => calls.push([settings.delayMs, previous.delayMs]))
      const fire = () => listeners.forEach((listener) => listener({ settings: { newValue: { delayMs: 2000 }, oldValue: { delayMs: 1500 } } }, 'local'))

      listeners[0]({ somethingElse: { newValue: 1 } }, 'local')
      listeners[0]({ settings: { newValue: { delayMs: 9 } } }, 'sync')
      fire()
      stop()
      fire()
      assert.deepEqual(calls, [[2000, 1500]])
    })
  })

  describe('sites', () => {
    it('lists the built-in sites, including any Jira workspace', () => {
      const settings = settingsWith()
      for (const hostname of ['mail.google.com', 'chat.google.com', 'web.whatsapp.com', 'www.linkedin.com', 'acme.atlassian.net']) {
        assert.equal(isSiteListed(settings, hostname), true, hostname)
      }
    })

    it('does not list other sites, or lookalikes of listed ones', () => {
      const settings = settingsWith()
      for (const hostname of ['example.com', 'atlassian.net.evil.com', 'evilatlassian.net', 'fake-mail.google.com', '']) {
        assert.equal(isSiteListed(settings, hostname), false, hostname)
      }
    })

    it('lists sites the user added', () => {
      assert.equal(isSiteListed(settingsWith({ customSites: ['example.com'] }), 'example.com'), true)
    })

    it('pauses one Jira workspace without pausing another', () => {
      const settings = settingsWith({ pausedSites: ['acme.atlassian.net'] })
      assert.equal(isSitePaused(settings, 'acme.atlassian.net'), true)
      assert.equal(isSitePaused(settings, 'other.atlassian.net'), false)
    })

    it('resumes a site that was paused through a broader entry', () => {
      const settings = settingsWith({ pausedSites: ['*.atlassian.net', 'mail.google.com'] })
      assert.deepEqual(setSitePaused(settings, 'acme.atlassian.net', false), ['mail.google.com'])
    })

    it('does not list a paused site twice', () => {
      const settings = settingsWith({ pausedSites: ['mail.google.com'] })
      assert.deepEqual(setSitePaused(settings, 'mail.google.com', true), ['mail.google.com'])
    })

    it('shows every site that can be switched, with paused ones it would otherwise lose', () => {
      const rows = getSiteRows(settingsWith({ customSites: ['example.com'], pausedSites: ['acme.atlassian.net', 'mail.google.com'] }))
      assert.deepEqual(
        rows.map(({ hostname }) => hostname),
        ['mail.google.com', 'chat.google.com', 'web.whatsapp.com', 'www.linkedin.com', '*.atlassian.net', 'example.com', 'acme.atlassian.net'],
      )
      assert.deepEqual(rows.filter(({ isCustom }) => isCustom).map(({ hostname }) => hostname), ['example.com'])
    })

    it('runs only when switched on, listed and not paused', () => {
      assert.equal(isAssistanceActive(settingsWith(), 'mail.google.com'), true)
      assert.equal(isAssistanceActive(settingsWith({ isInlineEnabled: false }), 'mail.google.com'), false)
      assert.equal(isAssistanceActive(settingsWith({ pausedSites: ['mail.google.com'] }), 'mail.google.com'), false)
      assert.equal(isAssistanceActive(settingsWith(), 'example.com'), false)
    })
  })

  describe('adding a site', () => {
    it('accepts a hostname or a full address', () => {
      for (const [input, hostname] of [
        ['example.com', 'example.com'],
        ['  Example.COM ', 'example.com'],
        ['https://docs.example.com/page?x=1', 'docs.example.com'],
        ['http://example.co.uk', 'example.co.uk'],
        ['example.com:8080', 'example.com'],
        ['localhost', 'localhost'],
      ]) {
        assert.equal(parseSiteInput(input), hostname, input)
      }
    })

    it('refuses anything that is not a website', () => {
      for (const input of ['', '   ', 'not a site', 'example', 'http://', '*.example.com', 'file:///etc/passwd', 'chrome://extensions']) {
        assert.equal(parseSiteInput(input), null, input)
      }
    })

    it('asks for one site, not all of them', () => {
      assert.equal(toMatchPattern('example.com'), '*://example.com/*')
    })
  })
})
