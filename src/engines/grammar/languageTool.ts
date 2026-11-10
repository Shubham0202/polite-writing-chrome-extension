/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { CATEGORIES, CONFIDENCE, ENGINES, SOURCES, type Category } from '../../constants/corrections.ts'
import { UserFacingError } from '../../utils/errors.ts'
import { lookup } from '../../utils/lookup.ts'
import { createSuggestion, type Suggestion } from '../suggestion.ts'

export interface LanguageToolOptions {
  serverUrl: string
  language: string
  signal?: AbortSignal
  unreachableMessage?: string
}

interface LanguageToolReplacement {
  value?: unknown
}

// Describes the fields read from the untrusted response; offset and length are verified with Number.isInteger before use.
interface LanguageToolMatch {
  offset: number
  length: number
  message?: unknown
  replacements?: Array<LanguageToolReplacement | null>
  rule?: { issueType?: string; category?: { id?: string } }
}

interface LanguageToolResponse {
  matches?: LanguageToolMatch[]
}

const REQUEST_TIMEOUT_MS = 6000
const MAX_REPLACEMENTS = 3
const HTTP_ERROR_MESSAGE: Partial<Record<number, string>> = {
  429: "LanguageTool's request limit was reached. Try again in a minute.",
}

// LanguageTool category ids are external data, so unknown ones fall back to "style" with low confidence.
const CATEGORY_BY_LANGUAGE_TOOL_CATEGORY: Record<string, Category> = {
  CASING: CATEGORIES.capitalization,
  PUNCTUATION: CATEGORIES.punctuation,
  TYPOGRAPHY: CATEGORIES.punctuation,
  GRAMMAR: CATEGORIES.grammar,
  CONFUSED_WORDS: CATEGORIES.grammar,
  COLLOCATIONS: CATEGORIES.grammar,
  NONSTANDARD_PHRASES: CATEGORIES.grammar,
  COMPOUNDING: CATEGORIES.grammar,
}

const HIGH_CONFIDENCE_CATEGORIES = new Set<Category>([CATEGORIES.grammar, CATEGORIES.punctuation, CATEGORIES.capitalization])

const isMatchObject = (match: unknown): match is LanguageToolMatch => typeof match === 'object' && match !== null

// Spelling belongs to the dictionary engine, which also respects the user's ignored words.
const isSpellingMatch = (match: LanguageToolMatch): boolean => match.rule?.issueType === 'misspelling' || match.rule?.category?.id === 'TYPOS'

const toSuggestion = (text: string, match: LanguageToolMatch): Suggestion | null => {
  const { offset, length } = match
  const isValidSpan = Number.isInteger(offset) && Number.isInteger(length) && offset >= 0 && offset + length <= text.length
  if (!isValidSpan) return null

  const category = lookup(CATEGORY_BY_LANGUAGE_TOOL_CATEGORY, match.rule?.category?.id) ?? CATEGORIES.style
  const replacements = (Array.isArray(match.replacements) ? match.replacements : [])
    .map((replacement: LanguageToolReplacement | null) => replacement?.value)
    .filter((value: unknown) => typeof value === 'string')
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

const requestCheck = async (
  text: string,
  { serverUrl, language, signal, unreachableMessage = `LanguageTool is not running at ${serverUrl}.` }: LanguageToolOptions,
): Promise<Response> => {
  try {
    return await fetch(`${serverUrl}/v2/check`, {
      method: 'POST',
      body: new URLSearchParams({ text, language }),
      signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]),
    })
  } catch (error) {
    if (signal?.aborted) throw new UserFacingError('The grammar check was cancelled.')
    throw new UserFacingError((error as { name?: unknown } | null)?.name === 'TimeoutError' ? `LanguageTool at ${serverUrl} did not respond in time.` : unreachableMessage)
  }
}

export const checkWithLanguageTool = async (text: string, options: LanguageToolOptions): Promise<Suggestion[]> => {
  const response = await requestCheck(text, options)
  if (!response.ok) {
    throw new UserFacingError(lookup(HTTP_ERROR_MESSAGE, response.status) ?? `LanguageTool returned an error (HTTP ${response.status}).`)
  }

  const body: LanguageToolResponse | null = await response.json().catch(() => null)
  if (!Array.isArray(body?.matches)) throw new UserFacingError('LanguageTool returned an unexpected response.')

  return (body.matches
    .filter((match: LanguageToolMatch) => isMatchObject(match) && !isSpellingMatch(match))
    .map((match: LanguageToolMatch) => toSuggestion(text, match))
    .filter((suggestion: Suggestion | null) => suggestion?.replacements.length)) as Suggestion[]
}
