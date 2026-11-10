import type { InlineCheckResult } from '../services/correctionPipeline.ts'
import { MESSAGE_TYPES, sendMessage } from '../services/messaging.ts'
import { getTextValidationError } from '../utils/textValidation.ts'

export interface TextCheckerOptions {
  onResult: (result: InlineCheckResult) => void
  onEmpty: () => void
  onRejected: (reason: string) => void
  onFailed: (reason: string) => void
  onDisconnected: () => void
}

export interface TextCheckRequest {
  text: string
  signal: AbortSignal
}

export type TextChecker = (request: TextCheckRequest) => Promise<false | undefined>

const cancelCheck = () => sendMessage(MESSAGE_TYPES.cancelInlineCheck).catch(() => {})

// Checks run in the service worker, so pages never load the engines or the dictionary and typing is never blocked.
// Resolves to false when the check could not run, so that the text is not counted as checked.
export const createTextChecker =
  ({ onResult, onEmpty, onRejected, onFailed, onDisconnected }: TextCheckerOptions): TextChecker =>
  async ({ text, signal }) => {
    if (!text.trim()) return void onEmpty()

    const validationError = getTextValidationError(text)
    if (validationError) return void onRejected(validationError)

    signal.addEventListener('abort', cancelCheck, { once: true })
    try {
      const result = await sendMessage(MESSAGE_TYPES.runInlineCheck, { text })
      if (!signal.aborted) onResult(result)
    } catch (error) {
      // After the extension is reloaded or removed, this copy of the script can no longer reach it.
      if (!chrome.runtime?.id) onDisconnected()
      else if (!signal.aborted) onFailed((error as Error).message)
      return false
    } finally {
      signal.removeEventListener('abort', cancelCheck)
    }
  }
