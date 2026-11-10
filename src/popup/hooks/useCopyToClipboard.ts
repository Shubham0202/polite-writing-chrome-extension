import { useEffect, useRef, useState } from 'react'

export const COPY_STATUS = Object.freeze({
  idle: 'idle',
  copied: 'copied',
  failed: 'failed',
})

export type CopyStatus = (typeof COPY_STATUS)[keyof typeof COPY_STATUS]

type TimerHandle = ReturnType<typeof setTimeout>

const FEEDBACK_DURATION_MS = 1500

export interface UseCopyToClipboardResult {
  copyStatus: CopyStatus
  copy: (text: string) => Promise<void>
}

export const useCopyToClipboard = (): UseCopyToClipboardResult => {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(COPY_STATUS.idle)
  const resetTimerRef = useRef<TimerHandle | null>(null)

  useEffect(() => () => clearTimeout(resetTimerRef.current as TimerHandle | undefined), [])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(COPY_STATUS.copied)
    } catch {
      setCopyStatus(COPY_STATUS.failed)
    }
    clearTimeout(resetTimerRef.current as TimerHandle | undefined)
    resetTimerRef.current = setTimeout(() => setCopyStatus(COPY_STATUS.idle), FEEDBACK_DURATION_MS)
  }

  return { copyStatus, copy }
}
