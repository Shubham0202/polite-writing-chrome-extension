import { useEffect, useState } from 'react'
import type { AiSettings } from '../../constants/ai.ts'
import { getAiSettings, normalizeAiSettings, onAiSettingsChanged } from '../../services/aiSettings.ts'

export const useAiSettings = () => {
  const [settings, setSettings] = useState<AiSettings | null>(null)

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
