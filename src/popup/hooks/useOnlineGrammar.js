import { useEffect, useState } from 'react'
import { getOnlineGrammarEnabled, setOnlineGrammarEnabled } from '../../services/onlineGrammar.js'

export const useOnlineGrammar = () => {
  const [isEnabled, setIsEnabledState] = useState(false)

  useEffect(() => {
    let isCancelled = false

    getOnlineGrammarEnabled()
      .then((isStoredEnabled) => {
        if (!isCancelled) setIsEnabledState(isStoredEnabled)
      })
      // A setting that cannot be read stays off, so text is never sent out by accident.
      .catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [])

  const setIsEnabled = (value) => {
    setIsEnabledState(value)
    setOnlineGrammarEnabled(value).catch(() => setIsEnabledState(false))
  }

  return { isEnabled, setIsEnabled }
}
