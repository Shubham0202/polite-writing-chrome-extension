import type { Tone } from '../constants/corrections.ts'
import type { IdentifiedSuggestion } from '../engines/suggestion.ts'
import type { ToneAlternatives } from '../services/correctionPipeline.ts'
import { findEdit, rebaseSuggestions } from '../utils/textRebase.ts'

export interface SuggestionState {
  text: string
  corrections: IdentifiedSuggestion[]
  toneAlternatives: ToneAlternatives
  aiRewrites: IdentifiedSuggestion[]
}

// What a check leaves behind for a field: the text it checked and everything found in it.
export interface StoredCheckResult {
  original: string
  suggestions: IdentifiedSuggestion[]
  toneAlternatives: ToneAlternatives
  aiRewrites?: IdentifiedSuggestion[]
}

export interface ReviewableState {
  corrections: IdentifiedSuggestion[]
  toneAlternatives: ToneAlternatives
  aiRewrites?: IdentifiedSuggestion[]
}

type Placed = Pick<IdentifiedSuggestion, 'offset' | 'length'>
type UpdateSuggestions = (suggestions: IdentifiedSuggestion[]) => IdentifiedSuggestion[]

// AI rewrites arrive separately, on request, and are kept with the check result so every edit moves all three alike.
export const createSuggestionState = ({ original, suggestions, toneAlternatives, aiRewrites = [] }: StoredCheckResult): SuggestionState => ({
  text: original,
  corrections: suggestions,
  toneAlternatives,
  aiRewrites,
})

const updateSuggestions = ({ corrections, toneAlternatives, aiRewrites }: SuggestionState, update: UpdateSuggestions): Omit<SuggestionState, 'text'> => ({
  corrections: update(corrections),
  toneAlternatives: Object.fromEntries(Object.entries(toneAlternatives).map(([tone, rewrites]) => [tone, update(rewrites)])) as ToneAlternatives,
  aiRewrites: update(aiRewrites),
})

export const rebaseSuggestionState = (state: SuggestionState, text: string): SuggestionState => {
  const edit = findEdit(state.text, text)
  return { ...updateSuggestions(state, (suggestions) => rebaseSuggestions(suggestions, edit, text)), text }
}

// Offsets change with every edit, so a dismissed suggestion is recognised by what it says. The same mistake elsewhere
// in the field stays dismissed too, which beats it coming back as the text around it changes.
export const getSuggestionKey = ({ engine, original, replacements }: Pick<IdentifiedSuggestion, 'engine' | 'original' | 'replacements'>): string => [engine, original, replacements[0]].join('\n')

export const excludeDismissed = (state: SuggestionState, dismissedKeys: ReadonlySet<string> | undefined): SuggestionState => ({
  ...updateSuggestions(state, (suggestions) => suggestions.filter((suggestion) => !dismissedKeys?.has(getSuggestionKey(suggestion)))),
  text: state.text,
})

// An insertion has no text of its own to underline, so the character next to it stands in.
export const getDisplaySpan = ({ offset, length }: Placed, text: string): [number, number] => {
  if (length > 0) return [offset, offset + length]
  return offset > 0 ? [offset - 1, offset] : [0, Math.min(1, text.length)]
}

// Strictly inside: a caret resting at the end of a word is usually still typing it.
export const findSuggestionAt = (suggestions: IdentifiedSuggestion[], offset: number): IdentifiedSuggestion | undefined =>
  suggestions.find((suggestion) => offset > suggestion.offset && offset < suggestion.offset + suggestion.length)

export const findRewrite = (toneAlternatives: ToneAlternatives, suggestion: Placed, tone: Tone): IdentifiedSuggestion | undefined =>
  toneAlternatives[tone].find(
    (rewrite) => rewrite.offset <= suggestion.offset && suggestion.offset + suggestion.length <= rewrite.offset + rewrite.length,
  )

const byOffset = (first: Placed, second: Placed) => first.offset - second.offset

const getRewritableSentences = (toneAlternatives: ToneAlternatives): IdentifiedSuggestion[] => [
  ...new Map(
    Object.values(toneAlternatives)
      .flat()
      .map((rewrite) => [rewrite.offset, rewrite]),
  ).values(),
]

// Everything the badge can step through. A sentence with a mistake in it is reached through that mistake's card;
// a sentence without one has nothing to underline, so the badge is the only way to its rewrite.
export const getReviewItems = ({ corrections, toneAlternatives, aiRewrites = [] }: ReviewableState): IdentifiedSuggestion[] => {
  const sentencesWithoutMistakes = getRewritableSentences(toneAlternatives).filter(
    (sentence) => !corrections.some(({ offset }) => offset >= sentence.offset && offset <= sentence.offset + sentence.length),
  )
  return [...corrections, ...sentencesWithoutMistakes, ...aiRewrites].sort(byOffset)
}

// The list of every suggestion puts the AI's rewrites first: the user asked for them, so they are what the keyboard
// lands on. The badge and the single card keep plain text order.
export const getListItems = (state: SuggestionState): IdentifiedSuggestion[] => [
  ...[...(state.aiRewrites ?? [])].sort(byOffset),
  ...getReviewItems({ ...state, aiRewrites: [] }),
]

export const hasReviewItems = (state: ReviewableState): boolean => getReviewItems(state).length > 0

export const findNearestIndex = (items: Placed[], offset: number | null): number => {
  const index = items.findIndex((item) => item.offset + item.length >= (offset ?? 0))
  return index === -1 ? 0 : index
}
