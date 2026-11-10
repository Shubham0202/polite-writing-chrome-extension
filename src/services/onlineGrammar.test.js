import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { getOnlineGrammarEnabled, isOnlineGrammarAllowed, setOnlineGrammarEnabled } from './onlineGrammar.js'

describe('online grammar switch', () => {
  beforeEach(() => {
    const stored = {}
    globalThis.chrome = {
      storage: {
        local: {
          get: async (key) => (key in stored ? { [key]: stored[key] } : {}),
          set: async (values) => Object.assign(stored, values),
        },
      },
    }
  })

  afterEach(() => {
    delete globalThis.chrome
  })

  it('starts off', async () => {
    assert.equal(await getOnlineGrammarEnabled(), false)
  })

  it('remembers the switch', async () => {
    await setOnlineGrammarEnabled(true)
    assert.equal(await getOnlineGrammarEnabled(), true)
  })

  it('goes online only when both the request and the stored switch say so', async () => {
    assert.equal(await isOnlineGrammarAllowed(true), false)
    await setOnlineGrammarEnabled(true)
    assert.equal(await isOnlineGrammarAllowed(true), true)
    assert.equal(await isOnlineGrammarAllowed(false), false)
    assert.equal(await isOnlineGrammarAllowed('yes'), false)
  })

  it('stays on this device when the stored switch cannot be read', async () => {
    chrome.storage.local.get = async () => {
      throw new Error('storage unavailable')
    }
    assert.equal(await isOnlineGrammarAllowed(true), false)
  })
})
