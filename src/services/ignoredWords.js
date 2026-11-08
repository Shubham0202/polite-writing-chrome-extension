import { onStorageValueChanged } from './storageChanges.js'

const STORAGE_KEY = 'ignoredWords'

export const getIgnoredWords = async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? []

export const addIgnoredWord = async (word) => {
  if (typeof word !== 'string' || !word.trim()) return
  const words = await getIgnoredWords()
  const normalizedWord = word.trim().toLowerCase()
  if (!words.includes(normalizedWord)) await chrome.storage.local.set({ [STORAGE_KEY]: [...words, normalizedWord] })
}

export const removeIgnoredWord = async (word) => {
  await chrome.storage.local.set({ [STORAGE_KEY]: (await getIgnoredWords()).filter((ignoredWord) => ignoredWord !== word) })
}

export const onIgnoredWordsChanged = (listener) => onStorageValueChanged(STORAGE_KEY, (words) => listener(words ?? []))
