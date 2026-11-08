import { useEffect, useRef, useState } from 'react'
import { REWRITE_ACTION } from '../../constants/corrections.js'
import { applySuggestionDecisions, createDefaultDecisions } from '../../engines/suggestion.js'
import { MESSAGE_TYPES, sendMessage } from '../../services/messaging.js'
import { getTextValidationError } from '../../utils/textValidation.js'

const isCorrectionResult = (value) =>
  typeof value?.original === 'string' && Array.isArray(value?.suggestions) && Array.isArray(value?.engines)

// One id per popup document, so two popups open in two windows never replace or cancel each other's request.
const CLIENT_ID = crypto.randomUUID()

// Best effort: the worker stops the provider request if it still can; nothing depends on the answer.
const requestCancel = () => sendMessage(MESSAGE_TYPES.cancelRewrite, { clientId: CLIENT_ID }).catch(() => {})

export const useCorrection = () => {
  const [result, setResult] = useState(null)
  const [decisions, setDecisions] = useState({})
  const [pendingAction, setPendingAction] = useState(null)
  const [error, setError] = useState(null)
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

  const run = async (action, type, payload) => {
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
      if (token === requestTokenRef.current) setError(requestError.message)
    } finally {
      if (token === requestTokenRef.current) finish()
    }
  }

  const runCorrection = ({ action, text, tone, isOnlineGrammarEnabled }) =>
    run(action, MESSAGE_TYPES.runCorrection, { action, text, tone, isOnlineGrammarEnabled })

  const runRewrite = ({ text, style }) => run(REWRITE_ACTION, MESSAGE_TYPES.runRewrite, { text, style, clientId: CLIENT_ID })

  const cancelRewrite = () => {
    requestTokenRef.current += 1
    finish()
    requestCancel()
  }

  const toggleSuggestion = (id) =>
    setDecisions((current) => ({ ...current, [id]: { choice: 0, ...current[id], accepted: !current[id]?.accepted } }))

  const chooseReplacement = (id, choice) => setDecisions((current) => ({ ...current, [id]: { accepted: true, choice } }))

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
