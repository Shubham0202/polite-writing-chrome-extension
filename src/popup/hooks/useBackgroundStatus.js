import { useEffect, useState } from 'react'
import { MESSAGE_TYPES, sendMessage } from '../../services/messaging.js'

export const BACKGROUND_STATUS = Object.freeze({
  checking: 'checking',
  connected: 'connected',
  unavailable: 'unavailable',
})

export const useBackgroundStatus = () => {
  const [status, setStatus] = useState(BACKGROUND_STATUS.checking)
  const [version, setVersion] = useState(null)
  // null until the service worker has answered, and whenever the answer does not say.
  const [isAiConfigured, setIsAiConfigured] = useState(null)

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
