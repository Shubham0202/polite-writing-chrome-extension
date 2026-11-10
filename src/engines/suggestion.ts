import { CONFIDENCE, type Category, type Confidence, type Engine, type Source } from '../constants/corrections.ts'
import { applyEdits } from '../utils/diffUtils.ts'

export interface Suggestion {
  engine: Engine
  source: Source
  category: Category
  offset: number
  length: number
  original: string
  replacements: string[]
  explanation: string
  confidence: Confidence
  includedCorrections: IncludedCorrection[]
}

// A tone rewrite lists the corrections it already contains, so they are not offered a second time.
export type IncludedCorrection = Pick<Suggestion, 'category' | 'explanation'>

export interface SuggestionInput extends Omit<Suggestion, 'length' | 'replacements' | 'confidence' | 'includedCorrections'> {
  replacements: readonly string[]
  confidence?: Confidence
  includedCorrections?: IncludedCorrection[]
}

// The pipeline numbers what it returns, so the popup and the inline card can keep track of each choice.
export interface IdentifiedSuggestion extends Suggestion {
  id: string
}

export interface SuggestionDecision {
  accepted: boolean
  choice: number
}

export type SuggestionDecisions = Record<string, SuggestionDecision>

// Keeps the writer's apostrophe style: rules produce "doesn't", the text may use "doesn’t".
const matchApostrophes = (original: string, replacement: string) => (original.includes('’') ? replacement.replace(/'/g, '’') : replacement)

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
}: SuggestionInput): Suggestion => ({
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
export const formatSnippet = (text: string): string => (text.trim() ? text : text.replace(/ /g, '␣'))

// Uncertain suggestions are shown to the user but never applied without their approval.
export const isAcceptedByDefault = (suggestion: Suggestion): boolean =>
  suggestion.confidence === CONFIDENCE.high && suggestion.replacements.length > 0

export const createDefaultDecisions = (suggestions: readonly IdentifiedSuggestion[]): SuggestionDecisions =>
  Object.fromEntries(
    suggestions.map((suggestion) => [suggestion.id, { accepted: isAcceptedByDefault(suggestion), choice: 0 }]),
  )

export const applySuggestionDecisions = (
  text: string,
  suggestions: readonly IdentifiedSuggestion[],
  decisions: SuggestionDecisions,
): string =>
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

export const applyDefaultSuggestions = (text: string, suggestions: readonly Suggestion[]): string =>
  applyEdits(
    text,
    suggestions.filter(isAcceptedByDefault).map((suggestion) => ({
      offset: suggestion.offset,
      length: suggestion.length,
      replacement: suggestion.replacements[0],
    })),
  )
