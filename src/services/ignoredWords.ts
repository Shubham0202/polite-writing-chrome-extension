import { MAX_CHECKED_WORD_LENGTH } from '../constants/corrections.ts'
import { UserFacingError } from '../utils/errors.ts'
import { onStorageValueChanged } from './storageChanges.ts'

const STORAGE_KEY = 'ignoredWords'

// Several tabs can ignore words at the same moment; each change waits for the one before it, so none is lost.
let pendingChange = Promise.resolve()
const queueChange = (change: () => Promise<void>): Promise<void> => (pendingChange = pendingChange.then(change, change))

export const getIgnoredWords = async (): Promise<string[]> =>
  (await chrome.storage.local.get<{ ignoredWords?: string[] }>(STORAGE_KEY))[STORAGE_KEY] ?? []

export const addIgnoredWord = (word: unknown): Promise<void> =>
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

export const removeIgnoredWord = (word: string): Promise<void> =>
  queueChange(async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: (await getIgnoredWords()).filter((ignoredWord) => ignoredWord !== word) })
  })

export const onIgnoredWordsChanged = (listener: (words: string[]) => void): (() => void) =>
  onStorageValueChanged<string[]>(STORAGE_KEY, (words) => listener(words ?? []))
