/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { ENGINES, type Engine } from '../constants/corrections.ts'
import type { Suggestion } from '../engines/suggestion.ts'
import { lookup } from '../utils/lookup.ts'
import { findProtectedRanges } from '../utils/textUtils.ts'

const REPEATED_PHRASE_PATTERN = /\b((?:[a-z']+\s+){0,3}[a-z']+)\s+\1\b/gi
// Repeats that are grammatical: "I know that that is true", "she had had enough", "what it is is".
const ALLOWED_REPEATS = new Set(['that', 'had', 'is'])
const CONTEXT_LENGTH = 40
const MAX_GROWTH_FACTOR = 3
const MAX_GROWTH_CHARACTERS = 80
// A polite AI rewrite of "Fix it." is legitimately many times longer, so that engine alone gets more absolute room.
const MAX_GROWTH_CHARACTERS_BY_ENGINE = { [ENGINES.rewrite]: 240 }
const TERMINAL_MARK_PATTERN = /^[.?!]$/
const ENDS_WITH_TERMINAL_MARK_PATTERN = /[.?!]["'”’)\]]*$/

type ProtectedRange = ReturnType<typeof findProtectedRanges>[number]

const findRepeatedPhrases = (text: string): Set<string> =>
  new Set(
    Array.from(text.matchAll(REPEATED_PHRASE_PATTERN), (match) => match[1].toLowerCase()).filter(
      (phrase) => !ALLOWED_REPEATS.has(phrase),
    ),
  )

export const introducesRepeatedPhrase = (before: string, after: string): boolean => {
  const existingRepeats = findRepeatedPhrases(before)
  return [...findRepeatedPhrases(after)].some((phrase) => !existingRepeats.has(phrase))
}

const hasValidSpan = (text: string, { offset, length, original }: Pick<Suggestion, 'offset' | 'length' | 'original'>): boolean =>
  Number.isInteger(offset) && offset >= 0 && offset + length <= text.length && text.slice(offset, offset + length) === original

// An insertion touches a range only when it lands strictly inside it, so a period after a URL is allowed.
const touchesRange = ({ offset, length }: Pick<Suggestion, 'offset' | 'length'>, [start, end]: ProtectedRange): boolean => offset < end && start < offset + Math.max(length, 1)

// Tone and AI rewrites cover whole sentences, so instead of being dropped they must carry every URL and email through unchanged.
const WHOLE_SPAN_ENGINES = new Set<Engine>([ENGINES.tone, ENGINES.rewrite])

const keepsProtectedText = (text: string, suggestion: Suggestion, protectedRanges: ProtectedRange[]): ((replacement: string) => boolean) =>
  WHOLE_SPAN_ENGINES.has(suggestion.engine)
    ? (replacement) =>
        protectedRanges
          .filter((range) => touchesRange(suggestion, range))
          .every(([start, end]) => replacement.includes(text.slice(start, end)))
    : () => !protectedRanges.some((range) => touchesRange(suggestion, range))

const isReasonableReplacement = (text: string, suggestion: Suggestion, replacement: string): boolean => {
  const allowance = lookup(MAX_GROWTH_CHARACTERS_BY_ENGINE, suggestion.engine) ?? MAX_GROWTH_CHARACTERS
  if (replacement.length > suggestion.length * MAX_GROWTH_FACTOR + allowance) return false
  // The repeated-phrase rule catches rule-based artefacts ("please please"); an AI rewrite may say "bye bye" on purpose.
  if (suggestion.engine === ENGINES.rewrite) return true

  const start = Math.max(0, suggestion.offset - CONTEXT_LENGTH)
  const end = Math.min(text.length, suggestion.offset + suggestion.length + CONTEXT_LENGTH)
  const before = text.slice(start, end)
  const after = text.slice(start, suggestion.offset) + replacement + text.slice(suggestion.offset + suggestion.length, end)
  return !introducesRepeatedPhrase(before, after)
}

// Final safety net: drops suggestions that no longer match the text, touch URLs, emails or code, or whose
// replacements would duplicate words ("please please") or grow suspiciously long.
export const validateSuggestions = (text: string, suggestions: readonly Suggestion[]): Suggestion[] => {
  const protectedRanges = findProtectedRanges(text)

  return suggestions.flatMap((suggestion) => {
    if (!hasValidSpan(text, suggestion)) return []
    const isProtectedTextKept = keepsProtectedText(text, suggestion, protectedRanges)
    const replacements = suggestion.replacements.filter(
      (replacement) => isProtectedTextKept(replacement) && isReasonableReplacement(text, suggestion, replacement),
    )
    return replacements.length ? [{ ...suggestion, replacements }] : []
  })
}

// Drops an inserted "?" or "." when the change right before it already ends with one, which would give "??".
export const dropRedundantPunctuation = (suggestions: readonly Suggestion[]): Suggestion[] =>
  suggestions.filter(
    (insertion) =>
      insertion.length !== 0 ||
      !TERMINAL_MARK_PATTERN.test(insertion.replacements[0]) ||
      !suggestions.some(
        (other) =>
          other !== insertion &&
          other.offset + other.length === insertion.offset &&
          ENDS_WITH_TERMINAL_MARK_PATTERN.test(other.replacements[0] ?? ''),
      ),
  )
