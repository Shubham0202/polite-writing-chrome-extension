import { MAX_CHECKED_WORD_LENGTH } from '../constants/corrections.js'
import { UserFacingError } from '../utils/errors.js'
import { onStorageValueChanged } from './storageChanges.js'

const STORAGE_KEY = 'ignoredWords'

// Several tabs can ignore words at the same moment; each change waits for the one before it, so none is lost.
let pendingChange = Promise.resolve()
const queueChange = (change) => (pendingChange = pendingChange.then(change, change))

export const getIgnoredWords = async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? []

export const addIgnoredWord = (word) =>
  queueChange(async () => {
    const normalizedWord = typeof word === 'string' ? word.trim().toLowerCase() : ''
    // Longer words are never spell-checked, so remembering one would only grow the list.
    if (!normalizedWord || normalizedWord.length > MAX_CHECKED_WORD_LENGTH) return
    const words = await getIgnoredWords()
    if (words.includes(normalizedWord)) return
    // Every spell check reads the whole list, so it stays a size that is quick to read.
    if (words.length >= 1000) throw new UserFacingError('The list of ignored words is full. Remove some in Settings first.')
    await chrome.storage.local.set({ [STORAGE_KEY]: [...words, normalizedWord] })
  })

export const removeIgnoredWord = (word) =>
  queueChange(async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: (await getIgnoredWords()).filter((ignoredWord) => ignoredWord !== word) })
  })

export const onIgnoredWordsChanged = (listener) => onStorageValueChanged(STORAGE_KEY, (words) => listener(words ?? []))
