import { CATEGORIES, CONFIDENCE, ENGINES, SOURCES } from '../../constants/corrections.js'
import { UserFacingError } from '../../utils/errors.js'
import { lookup } from '../../utils/lookup.js'
import { createSuggestion } from '../suggestion.js'

const REQUEST_TIMEOUT_MS = 6000
const MAX_REPLACEMENTS = 3
const HTTP_ERROR_MESSAGE = {
  429: "LanguageTool's request limit was reached. Try again in a minute.",
}

// LanguageTool category ids are external data, so unknown ones fall back to "style" with low confidence.
const CATEGORY_BY_LANGUAGE_TOOL_CATEGORY = {
  CASING: CATEGORIES.capitalization,
  PUNCTUATION: CATEGORIES.punctuation,
  TYPOGRAPHY: CATEGORIES.punctuation,
  GRAMMAR: CATEGORIES.grammar,
  CONFUSED_WORDS: CATEGORIES.grammar,
  COLLOCATIONS: CATEGORIES.grammar,
  NONSTANDARD_PHRASES: CATEGORIES.grammar,
  COMPOUNDING: CATEGORIES.grammar,
}

const HIGH_CONFIDENCE_CATEGORIES = new Set([CATEGORIES.grammar, CATEGORIES.punctuation, CATEGORIES.capitalization])

const isMatchObject = (match) => typeof match === 'object' && match !== null

// Spelling belongs to the dictionary engine, which also respects the user's ignored words.
const isSpellingMatch = (match) => match.rule?.issueType === 'misspelling' || match.rule?.category?.id === 'TYPOS'

const toSuggestion = (text, match) => {
  const { offset, length } = match
  const isValidSpan = Number.isInteger(offset) && Number.isInteger(length) && offset >= 0 && offset + length <= text.length
  if (!isValidSpan) return null

  const category = lookup(CATEGORY_BY_LANGUAGE_TOOL_CATEGORY, match.rule?.category?.id) ?? CATEGORIES.style
  const replacements = (Array.isArray(match.replacements) ? match.replacements : [])
    .map((replacement) => replacement?.value)
    .filter((value) => typeof value === 'string')
    .slice(0, MAX_REPLACEMENTS)

  return createSuggestion({
    engine: ENGINES.grammar,
    source: SOURCES.languageTool,
    category,
    offset,
    original: text.slice(offset, offset + length),
    replacements,
    explanation: typeof match.message === 'string' ? match.message : 'LanguageTool suggests a change here.',
    confidence: HIGH_CONFIDENCE_CATEGORIES.has(category) ? CONFIDENCE.high : CONFIDENCE.low,
  })
}

const requestCheck = async (text, { serverUrl, language, signal, unreachableMessage = `LanguageTool is not running at ${serverUrl}.` }) => {
  try {
    return await fetch(`${serverUrl}/v2/check`, {
      method: 'POST',
      body: new URLSearchParams({ text, language }),
      signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]),
    })
  } catch (error) {
    if (signal?.aborted) throw new UserFacingError('The grammar check was cancelled.')
    throw new UserFacingError(error?.name === 'TimeoutError' ? `LanguageTool at ${serverUrl} did not respond in time.` : unreachableMessage)
  }
}

export const checkWithLanguageTool = async (text, options) => {
  const response = await requestCheck(text, options)
  if (!response.ok) {
    throw new UserFacingError(lookup(HTTP_ERROR_MESSAGE, response.status) ?? `LanguageTool returned an error (HTTP ${response.status}).`)
  }

  const body = await response.json().catch(() => null)
  if (!Array.isArray(body?.matches)) throw new UserFacingError('LanguageTool returned an unexpected response.')

  return body.matches
    .filter((match) => isMatchObject(match) && !isSpellingMatch(match))
    .map((match) => toSuggestion(text, match))
    .filter((suggestion) => suggestion?.replacements.length)
}
