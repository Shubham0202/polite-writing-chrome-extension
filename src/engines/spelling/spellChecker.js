/** @author Shubham Chandgude <shubham826852@gmail.com> */

import nspell from 'nspell'
import { CATEGORIES, CONFIDENCE, ENGINES, MAX_CHECKED_WORD_LENGTH, SOURCES } from '../../constants/corrections.js'
import { lookup } from '../../utils/lookup.js'
import { findProtectedRanges, isSentenceStart, matchCase, normalizeApostrophes, tokenizeWords } from '../../utils/textUtils.js'
import { createSuggestion } from '../suggestion.js'
import { VERB_FORMS, findVerbByForm } from '../tense/verbLexicon.js'
import { COMMON_MISSPELLINGS } from './commonMisspellings.js'

const MAX_SUGGESTIONS = 3
// nspell needs 15–100 ms per unknown word; past this budget the rest of a long text is left unchecked.
const SUGGESTION_BUDGET_MS = 1500
// Beyond this many edits the guess is usually a different word. A short word allows only one, since two edits
// rewrite most of it ("aniket" → "anklet").
const SHORT_WORD_LENGTH = 6
const getConfidentDistance = (word) => (word.length <= SHORT_WORD_LENGTH ? 1 : 2)
// The word right after a greeting is almost always a name ("hey aniket"), whatever its case.
const GREETING_BEFORE_PATTERN = /(?:^|[\s.!?,])(?:hey|hi|hello|dear)\s+$/i
const GREETING_LOOKBACK = 12
// "buyed" is the past tense of a known verb spelt by rule: the base is tried as written, with a dropped "e",
// a doubled last letter and a "y" turned into "i" ("stoped" → "stop", "tryed" → "try").
const REGULARIZED_PAST_PATTERN = /^(.{2,}?)ed$/
// When this share of words is unknown the text is probably not English (Hinglish "kal mai nahi aaunga"),
// so guesses like "kharab" → "karat" are shown but never pre-applied.
const FOREIGN_TEXT_UNKNOWN_RATIO = 0.5
const FOREIGN_TEXT_MIN_UNKNOWN_WORDS = 3

// The dictionary is en-US; British spellings are accepted when their American form is known.
const BRITISH_TO_AMERICAN = [
  [/our(s|ed|ing|ite|ites|able)?$/, 'or$1'],
  [/is(e|es|ed|ing|ation|ations)$/, 'iz$1'],
  [/ys(e|es|ed|ing)$/, 'yz$1'],
  [/tre(s)?$/, 'ter$1'],
  [/ogue(s)?$/, 'og$1'],
  [/ence(s)?$/, 'ense$1'],
  [/ll(ed|ing|er|ers)$/, 'l$1'],
  [/mme(s)?$/, 'm$1'],
]

const isInsideRanges = (ranges, offset) => ranges.some(([start, end]) => offset >= start && offset < end)

// Acronyms (EOD), camelCase names (WhatsApp) and words glued to digits are identifiers, not misspellings.
const isIdentifier = (text, token) =>
  /\p{Lu}/u.test(token.text.slice(1)) || /[\d_]/.test(text.charAt(token.offset - 1) + text.charAt(token.end))

const isLikelyProperNoun = (text, token) => /^\p{Lu}/u.test(token.text) && !isSentenceStart(text, token.offset)

const followsGreeting = (text, token) => GREETING_BEFORE_PATTERN.test(text.slice(Math.max(0, token.offset - GREETING_LOOKBACK), token.offset))

const toBaseCandidates = (stem) => [stem, `${stem}e`, stem.replace(/(.)\1$/, '$1'), stem.replace(/i$/, 'y')]

// nspell only offers look-alikes for these ("buyed" → "bused"); the verb lexicon knows the real past tense.
const findRegularizedPast = (word) => {
  const stem = REGULARIZED_PAST_PATTERN.exec(word)?.[1]
  if (!stem) return null
  const match = toBaseCandidates(stem).map((base) => findVerbByForm(base, [VERB_FORMS.base])).find(Boolean)
  return match && match.verb.past !== word ? { base: match.verb.base, past: match.verb.past } : null
}

// "café" and "naïve" are in the dictionary without their accents.
const stripAccents = (word) => word.normalize('NFD').replace(/\p{M}/gu, '')

// Optimal string alignment distance: like Levenshtein, but a swap of two neighbours ("thier") costs 1.
const getEditDistance = (source, target) => {
  const distances = Array.from({ length: source.length + 1 }, (_, row) =>
    Array.from({ length: target.length + 1 }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)),
  )

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + cost,
      )
      const isSwap = row > 1 && column > 1 && source[row - 1] === target[column - 2] && source[row - 2] === target[column - 1]
      if (isSwap) distances[row][column] = Math.min(distances[row][column], distances[row - 2][column - 2] + 1)
    }
  }

  return distances[source.length][target.length]
}

const rankCandidates = (word, candidates) => {
  const lowerWord = word.toLowerCase()
  return candidates
    .map((candidate, index) => ({ candidate, index, distance: getEditDistance(lowerWord, candidate.toLowerCase()) }))
    .sort((first, second) => first.distance - second.distance || first.index - second.index)
    .map(({ candidate }) => candidate)
}

export const createSpellChecker = (dictionary) => {
  const speller = nspell(dictionary)
  const candidateCache = new Map()

  const isKnownWord = (word) =>
    speller.correct(word) ||
    speller.correct(stripAccents(word)) ||
    BRITISH_TO_AMERICAN.some(([pattern, replacement]) => pattern.test(word) && speller.correct(word.replace(pattern, replacement)))

  const findCandidates = (word) => {
    if (!candidateCache.has(word)) {
      // A lowercase word is not corrected into an unrelated proper noun ("kyunki" → "Nunki").
      const isLowercase = word === word.toLowerCase()
      const candidates = speller
        .suggest(word)
        .filter((candidate) => !isLowercase || !/^\p{Lu}/u.test(candidate) || candidate.toLowerCase() === word)
      candidateCache.set(word, rankCandidates(word, candidates))
    }
    return candidateCache.get(word)
  }

  const toSuggestion = (token, replacements, explanation, confidence) =>
    createSuggestion({
      engine: ENGINES.spelling,
      source: SOURCES.dictionary,
      category: CATEGORIES.spelling,
      offset: token.offset,
      original: token.text,
      replacements: replacements.slice(0, MAX_SUGGESTIONS).map((candidate) => matchCase(token.text, candidate)),
      explanation,
      confidence,
    })

  return (text, { ignoredWords = [] } = {}) => {
    const ignored = new Set(ignoredWords.map((word) => word.toLowerCase()))
    const protectedRanges = findProtectedRanges(text)
    const deadline = performance.now() + SUGGESTION_BUDGET_MS
    let isComplete = true

    const checkedWords = tokenizeWords(text)
      .filter(
        (token) =>
          token.text.length <= MAX_CHECKED_WORD_LENGTH &&
          !ignored.has(token.lower) &&
          !isInsideRanges(protectedRanges, token.offset) &&
          !isIdentifier(text, token) &&
          !isLikelyProperNoun(text, token),
      )
      .map((token) => ({ token, word: normalizeApostrophes(token.text) }))
      .map((entry) => ({ ...entry, commonCorrection: lookup(COMMON_MISSPELLINGS, entry.word.toLowerCase()) }))
    // Words with accents or non-Latin letters are not English dictionary words, so they are never flagged.
    const unknownWords = checkedWords.filter(
      ({ word, commonCorrection }) => commonCorrection || !(isKnownWord(word) || /\P{ASCII}/u.test(word)),
    )
    const isLikelyForeignText =
      unknownWords.length >= FOREIGN_TEXT_MIN_UNKNOWN_WORDS && unknownWords.length / checkedWords.length >= FOREIGN_TEXT_UNKNOWN_RATIO

    const suggestions = unknownWords.flatMap(({ token, word, commonCorrection }) => {
      if (commonCorrection) {
        return [toSuggestion(token, [commonCorrection], `"${token.text}" is a common misspelling or shorthand of "${commonCorrection}".`, CONFIDENCE.high)]
      }
      const regularizedPast = findRegularizedPast(word.toLowerCase())
      if (regularizedPast) {
        const explanation = `"${token.text}" is not a word: the past tense of "${regularizedPast.base}" is "${regularizedPast.past}".`
        return [toSuggestion(token, [regularizedPast.past], explanation, CONFIDENCE.high)]
      }
      if (!candidateCache.has(word) && performance.now() > deadline) {
        isComplete = false
        return []
      }

      const candidates = findCandidates(word)
      if (!candidates.length) return []

      // A capitalized unknown word at the start of a sentence is often a name ("Rajesh"), so it is never pre-applied.
      const isConfident =
        !isLikelyForeignText &&
        !/^\p{Lu}/u.test(token.text) &&
        !followsGreeting(text, token) &&
        getEditDistance(word.toLowerCase(), candidates[0].toLowerCase()) <= getConfidentDistance(word)
      return [
        toSuggestion(
          token,
          candidates,
          isConfident
            ? `"${token.text}" is not in the English dictionary.`
            : `"${token.text}" is not in the English dictionary, but it may be a name or a non-English word.`,
          isConfident ? CONFIDENCE.high : CONFIDENCE.low,
        ),
      ]
    })

    return { suggestions, isComplete }
  }
}
