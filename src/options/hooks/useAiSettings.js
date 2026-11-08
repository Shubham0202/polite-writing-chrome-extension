import { useEffect, useState } from 'react'
import { getAiSettings, normalizeAiSettings, onAiSettingsChanged } from '../../services/aiSettings.js'

export const useAiSettings = () => {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    let isCancelled = false

    getAiSettings()
      .then((storedSettings) => {
        if (!isCancelled) setSettings(storedSettings)
      })
      .catch(() => {
        if (!isCancelled) setSettings(normalizeAiSettings())
      })
    const stopListening = onAiSettingsChanged(setSettings)

    return () => {
      isCancelled = true
      stopListening()
    }
  }, [])

  return settings
}
