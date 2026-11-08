import { useEffect, useState } from 'react'

const STORAGE_KEY = 'isOnlineGrammarEnabled'

// Off until the user turns it on, because it sends their text to an outside service.
export const useOnlineGrammar = () => {
  const [isEnabled, setIsEnabledState] = useState(false)

  useEffect(() => {
    let isCancelled = false

    chrome.storage.local
      .get(STORAGE_KEY)
      .then((stored) => {
        if (!isCancelled) setIsEnabledState(stored[STORAGE_KEY] === true)
      })
      // A setting that cannot be read stays off, so text is never sent out by accident.
      .catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [])

  const setIsEnabled = (value) => {
    setIsEnabledState(value)
    chrome.storage.local.set({ [STORAGE_KEY]: value }).catch(() => setIsEnabledState(false))
  }

  return { isEnabled, setIsEnabled }
}
