import { useEffect, useState } from 'react'
import type { Settings } from '../constants/settings.ts'
import { getSettings, normalizeSettings, onSettingsChanged, updateSettings } from '../services/settings.ts'

// The popup and the settings page stay in step, because each listens for the other's changes.
export interface UseSettingsResult {
  settings: Settings | null
  updateSettings: typeof updateSettings
}

export const useSettings = (): UseSettingsResult => {
  const [settings, setSettings] = useState<Settings | null>(null)

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
