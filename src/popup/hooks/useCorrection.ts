import { useEffect, useRef, useState } from 'react'
import type { RewriteStyle } from '../../constants/ai.ts'
import { REWRITE_ACTION, type CorrectionAction, type Tone } from '../../constants/corrections.ts'
import { applySuggestionDecisions, createDefaultDecisions, type SuggestionDecision, type SuggestionDecisions } from '../../engines/suggestion.ts'
import type { CorrectionResult } from '../../services/correctionPipeline.ts'
import { MESSAGE_TYPES, sendMessage, type MessagePayload } from '../../services/messaging.ts'
import type { RewriteResult } from '../../services/writingEnhancer.ts'
import { getTextValidationError } from '../../utils/textValidation.ts'

export type PopupResult = CorrectionResult | RewriteResult

export type PendingAction = CorrectionAction | typeof REWRITE_ACTION

type RunMessageType = typeof MESSAGE_TYPES.runCorrection | typeof MESSAGE_TYPES.runRewrite

export interface RunCorrectionOptions {
  action: CorrectionAction
  text: string
  tone: Tone
  isOnlineGrammarEnabled: boolean
}

export interface RunRewriteOptions {
  text: string
  style: RewriteStyle
}

export interface UseCorrectionResult {
  result: PopupResult | null
  decisions: SuggestionDecisions
  correctedText: string
  pendingAction: PendingAction | null
  error: string | null
  runCorrection: (options: RunCorrectionOptions) => Promise<void>
  runRewrite: (options: RunRewriteOptions) => Promise<void>
  cancelRewrite: () => void
  toggleSuggestion: (id: string) => void
  chooseReplacement: (id: string, choice: number) => void
  clearResult: () => void
}

const isCorrectionResult = (value: PopupResult | undefined): value is PopupResult =>
  typeof value?.original === 'string' && Array.isArray(value?.suggestions) && Array.isArray(value?.engines)

// One id per popup document, so two popups open in two windows never replace or cancel each other's request.
const CLIENT_ID = crypto.randomUUID()

// Best effort: the worker stops the provider request if it still can; nothing depends on the answer.
const requestCancel = () => sendMessage(MESSAGE_TYPES.cancelRewrite, { clientId: CLIENT_ID }).catch(() => {})

export const useCorrection = (): UseCorrectionResult => {
  const [result, setResult] = useState<PopupResult | null>(null)
  const [decisions, setDecisions] = useState<SuggestionDecisions>({})
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Each request gets a token and its reply only counts while that token is current, so a cancelled or superseded
  // request can never show its result late.
  const requestTokenRef = useRef(0)
  const isRewritingRef = useRef(false)

  useEffect(() => {
    // Closing the popup abandons a rewrite; telling the service worker lets it stop the provider request.
    const handlePageHide = () => {
      if (isRewritingRef.current) requestCancel()
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [])

  const correctedText = result ? applySuggestionDecisions(result.original, result.suggestions, decisions) : ''

  const finish = () => {
    isRewritingRef.current = false
    setPendingAction(null)
  }

  const run = async (action: PendingAction, type: RunMessageType, payload: MessagePayload<RunMessageType>) => {
    const validationError = getTextValidationError(payload.text)
    setResult(null)
    setError(validationError)
    if (validationError) return

    const token = ++requestTokenRef.current
    isRewritingRef.current = action === REWRITE_ACTION
    setPendingAction(action)
    try {
      const response = await sendMessage(type, payload)
      if (token !== requestTokenRef.current) return
      if (!isCorrectionResult(response)) throw new Error('The correction service returned an unexpected response.')
      setResult(response)
      setDecisions(createDefaultDecisions(response.suggestions))
    } catch (requestError) {
      if (token === requestTokenRef.current) setError((requestError as Error).message)
    } finally {
      if (token === requestTokenRef.current) finish()
    }
  }

  const runCorrection = ({ action, text, tone, isOnlineGrammarEnabled }: RunCorrectionOptions) =>
    run(action, MESSAGE_TYPES.runCorrection, { action, text, tone, isOnlineGrammarEnabled })

  const runRewrite = ({ text, style }: RunRewriteOptions) => run(REWRITE_ACTION, MESSAGE_TYPES.runRewrite, { text, style, clientId: CLIENT_ID })

  const cancelRewrite = () => {
    requestTokenRef.current += 1
    finish()
    requestCancel()
  }

  const toggleSuggestion = (id: string) =>
    setDecisions((current) => ({ ...current, [id]: { choice: 0, ...current[id] as SuggestionDecision | undefined, accepted: !current[id]?.accepted } }))

  const chooseReplacement = (id: string, choice: number) => setDecisions((current) => ({ ...current, [id]: { accepted: true, choice } }))

  const clearResult = () => {
    setResult(null)
    setDecisions({})
    setError(null)
  }

  return {
    result,
    decisions,
    correctedText,
    pendingAction,
    error,
    runCorrection,
    runRewrite,
    cancelRewrite,
    toggleSuggestion,
    chooseReplacement,
    clearResult,
  }
}
