import { useEffect, useState } from 'react'
import { MESSAGE_TYPES, sendMessage } from '../../services/messaging.ts'

export const BACKGROUND_STATUS = Object.freeze({
  checking: 'checking',
  connected: 'connected',
  unavailable: 'unavailable',
})

export type BackgroundStatus = (typeof BACKGROUND_STATUS)[keyof typeof BACKGROUND_STATUS]

export interface UseBackgroundStatusResult {
  status: BackgroundStatus
  version: string | null
  isAiConfigured: boolean | null
}

export const useBackgroundStatus = (): UseBackgroundStatusResult => {
  const [status, setStatus] = useState<BackgroundStatus>(BACKGROUND_STATUS.checking)
  const [version, setVersion] = useState<string | null>(null)
  // null until the service worker has answered, and whenever the answer does not say.
  const [isAiConfigured, setIsAiConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    let isCancelled = false

    sendMessage(MESSAGE_TYPES.ping)
      .then((response) => {
        if (isCancelled) return
        setVersion(response?.version ?? null)
        setIsAiConfigured(typeof response?.isAiConfigured === 'boolean' ? response.isAiConfigured : null)
        setStatus(BACKGROUND_STATUS.connected)
      })
      .catch(() => {
        if (!isCancelled) setStatus(BACKGROUND_STATUS.unavailable)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  return { status, version, isAiConfigured }
}
