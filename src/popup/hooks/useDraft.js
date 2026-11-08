import { useEffect } from 'react'

const STORAGE_KEY = 'popupDraft'

// Opening Settings closes the popup, which would lose what was typed. The draft waits in session storage, which
// lives in memory only, and comes back the next time the popup opens.
export const stashDraft = (text) => chrome.storage.session?.set({ [STORAGE_KEY]: text })?.catch(() => {})

export const useRestoredDraft = (onRestore) => {
  useEffect(() => {
    let isCancelled = false

    chrome.storage.session
      ?.get(STORAGE_KEY)
      .then((stored) => {
        const draft = stored?.[STORAGE_KEY]
        if (isCancelled || typeof draft !== 'string' || !draft) return
        chrome.storage.session.remove(STORAGE_KEY).catch(() => {})
        onRestore(draft)
      })
      .catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [onRestore])
}
