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

  it('refuses words too long to ever be spell-checked', async () => {
    await addIgnoredWord('a'.repeat(21))
    await addIgnoredWord('a'.repeat(20))
    assert.deepEqual(await getIgnoredWords(), ['a'.repeat(20)])
  })

  it('keeps every word when several are ignored at the same moment', async () => {
    await Promise.all(['alpha', 'beta', 'gamma'].map(addIgnoredWord))
    assert.deepEqual(await getIgnoredWords(), ['alpha', 'beta', 'gamma'])
  })

  it('stops adding words once the list is full', async () => {
    const fullList = Array.from({ length: 1000 }, (_, index) => `word${index}`)
    await chrome.storage.local.set({ ignoredWords: fullList })
    await assert.rejects(addIgnoredWord('another'), { name: 'UserFacingError' })
    await addIgnoredWord('word5')
    assert.equal((await getIgnoredWords()).length, 1000)
  })

  it('still works after a change fails', async () => {
    await chrome.storage.local.set({ ignoredWords: Array.from({ length: 1000 }, (_, index) => `word${index}`) })
    await assert.rejects(addIgnoredWord('another'))
    await removeIgnoredWord('word0')
    await addIgnoredWord('another')
    assert.equal((await getIgnoredWords()).at(-1), 'another')
  })
})
