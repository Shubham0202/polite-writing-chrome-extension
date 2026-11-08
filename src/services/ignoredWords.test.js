import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { addIgnoredWord, getIgnoredWords, removeIgnoredWord } from './ignoredWords.js'

describe('ignored words', () => {
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

  it('starts empty', async () => {
    assert.deepEqual(await getIgnoredWords(), [])
  })

  it('remembers a word once, whatever its case', async () => {
    await addIgnoredWord('Rajesh')
    await addIgnoredWord('rajesh')
    await addIgnoredWord('Medarch')
    assert.deepEqual(await getIgnoredWords(), ['rajesh', 'medarch'])
  })

  it('forgets a word when asked', async () => {
    await addIgnoredWord('Rajesh')
    await addIgnoredWord('Medarch')
    await removeIgnoredWord('rajesh')
    assert.deepEqual(await getIgnoredWords(), ['medarch'])
  })

  it('refuses anything that is not a word', async () => {
    await addIgnoredWord('   ')
    await addIgnoredWord(undefined)
    assert.deepEqual(await getIgnoredWords(), [])
  })
})
