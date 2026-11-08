import { useEffect, useState } from 'react'
import { getSettings, normalizeSettings, onSettingsChanged, updateSettings } from '../services/settings.js'

// The popup and the settings page stay in step, because each listens for the other's changes.
export const useSettings = () => {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    let isCancelled = false

    getSettings()
      .then((storedSettings) => {
        if (!isCancelled) setSettings(storedSettings)
      })
      .catch(() => {
        if (!isCancelled) setSettings(normalizeSettings())
      })
    const stopListening = onSettingsChanged(setSettings)

    return () => {
      isCancelled = true
      stopListening()
    }
  }, [])

  return { settings, updateSettings }
}
