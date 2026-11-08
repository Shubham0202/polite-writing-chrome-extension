import { CONFIDENCE } from '../constants/corrections.js'
import { applyEdits } from '../utils/diffUtils.js'

// Keeps the writer's apostrophe style: rules produce "doesn't", the text may use "doesn’t".
const matchApostrophes = (original, replacement) => (original.includes('’') ? replacement.replace(/'/g, '’') : replacement)

export const createSuggestion = ({
  engine,
  source,
  category,
  offset,
  original,
  replacements,
  explanation,
  confidence = CONFIDENCE.high,
  includedCorrections = [],
}) => ({
  engine,
  source,
  category,
  offset,
  length: original.length,
  original,
  replacements: [...new Set(replacements.map((replacement) => matchApostrophes(original, replacement)))].filter(
    (replacement) => replacement !== original,
  ),
  explanation,
  confidence,
  includedCorrections,
})

// Whitespace-only edits are invisible, so spaces are shown as "␣".
export const formatSnippet = (text) => (text.trim() ? text : text.replace(/ /g, '␣'))

// Uncertain suggestions are shown to the user but never applied without their approval.
export const isAcceptedByDefault = (suggestion) =>
  suggestion.confidence === CONFIDENCE.high && suggestion.replacements.length > 0

export const createDefaultDecisions = (suggestions) =>
  Object.fromEntries(
    suggestions.map((suggestion) => [suggestion.id, { accepted: isAcceptedByDefault(suggestion), choice: 0 }]),
  )

export const applySuggestionDecisions = (text, suggestions, decisions) =>
  applyEdits(
    text,
    suggestions
      .filter((suggestion) => decisions[suggestion.id]?.accepted)
      .map((suggestion) => ({
        offset: suggestion.offset,
        length: suggestion.length,
        replacement: suggestion.replacements[decisions[suggestion.id].choice] ?? suggestion.replacements[0],
      })),
  )

export const applyDefaultSuggestions = (text, suggestions) =>
  applyEdits(
    text,
    suggestions.filter(isAcceptedByDefault).map((suggestion) => ({
      offset: suggestion.offset,
      length: suggestion.length,
      replacement: suggestion.replacements[0],
    })),
  )
