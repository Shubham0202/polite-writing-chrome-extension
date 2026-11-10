const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}'’-]/u

export interface TextChange {
  start: number
  oldEnd: number
  newEnd: number
}

interface PlacedText {
  offset: number
  length: number
  original: string
}

const isWordCharacter = (character: string | undefined) => character !== undefined && WORD_CHARACTER_PATTERN.test(character)

// Finds the single edit that turns one text into another from what they share at the start and end.
export const findEdit = (before: string, after: string): TextChange => {
  const sharedLimit = Math.min(before.length, after.length)
  let start = 0
  while (start < sharedLimit && before[start] === after[start]) start += 1

  let sharedEnd = 0
  while (sharedEnd < sharedLimit - start && before[before.length - 1 - sharedEnd] === after[after.length - 1 - sharedEnd]) sharedEnd += 1

  return { start, oldEnd: before.length - sharedEnd, newEnd: after.length - sharedEnd }
}

// Moves suggestions through an edit, so underlines stay on their words until the next check. A suggestion the edit
// touched no longer describes the text and is dropped. Typing a space right after a word leaves the word as it was.
export const rebaseSuggestions = <Suggestion extends PlacedText>(
  suggestions: readonly Suggestion[],
  { start, oldEnd, newEnd }: TextChange,
  text: string,
): Suggestion[] =>
  suggestions.flatMap((suggestion) => {
    const end = suggestion.offset + suggestion.length
    const isBeforeEdit = end < start || (end === start && !isWordCharacter(text[start]))
    const isAfterEdit = suggestion.offset > oldEnd || (suggestion.offset === oldEnd && !isWordCharacter(text[newEnd - 1]))
    if (!isBeforeEdit && !isAfterEdit) return []

    const offset = isBeforeEdit ? suggestion.offset : suggestion.offset + newEnd - oldEnd
    return text.slice(offset, offset + suggestion.length) === suggestion.original ? [{ ...suggestion, offset }] : []
  })
