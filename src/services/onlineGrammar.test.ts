import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { getOnlineGrammarEnabled, isOnlineGrammarAllowed, setOnlineGrammarEnabled } from './onlineGrammar.ts'

describe('online grammar switch', () => {
  beforeEach(() => {
    const stored: Record<string, unknown> = {}
    globalThis.chrome = {
      storage: {
        local: {
          get: async (key: string) => (key in stored ? { [key]: stored[key] } : {}),
          set: async (values: Record<string, unknown>) => Object.assign(stored, values),
        },
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    delete (globalThis as { chrome?: typeof chrome }).chrome
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
