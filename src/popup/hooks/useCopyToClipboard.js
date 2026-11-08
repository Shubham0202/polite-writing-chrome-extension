import { useEffect, useRef, useState } from 'react'

export const COPY_STATUS = Object.freeze({
  idle: 'idle',
  copied: 'copied',
  failed: 'failed',
})

const FEEDBACK_DURATION_MS = 1500

export const useCopyToClipboard = () => {
  const [copyStatus, setCopyStatus] = useState(COPY_STATUS.idle)
  const resetTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(resetTimerRef.current), [])

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(COPY_STATUS.copied)
    } catch {
      setCopyStatus(COPY_STATUS.failed)
    }
    clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => setCopyStatus(COPY_STATUS.idle), FEEDBACK_DURATION_MS)
  }

  return { copyStatus, copy }
}
