import { ENGINES, SOURCES } from '../../constants/corrections.js'
import { matchCase, normalizeApostrophes, splitSentences, tokenizeWords } from '../../utils/textUtils.js'
import { createSuggestion } from '../suggestion.js'
import { TENSE_RULES } from './tenseRules.js'
import { VERB_FORMS, findVerbByForm } from './verbLexicon.js'

const PAST_TIME_PATTERN =
  /\byesterday\b(?!'s)|\blast\s+(?:night|week|month|year|weekend|time|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b(?!'s)|\b(?:a|an|one|two|three|four|five|few|several|\d+)\s+(?:minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/i
const HABIT_OR_DURATION_PATTERN = /\b(?:every|usually|always|often|sometimes|daily|weekly|monthly|normally|generally|since)\b/i
const PAST_AUXILIARIES = new Set(['was', 'were', 'had', 'did', "wasn't", "weren't", "hadn't", "didn't"])
const BASE_VERB_TRIGGERS = new Set([
  'do', 'does', "don't", "doesn't", 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
  "can't", 'cannot', "couldn't", "shouldn't", "wouldn't", "won't", "mustn't", 'to',
])

const createContext = (text, sentence) => {
  const tokens = tokenizeWords(sentence.text, sentence.offset)
  return {
    text,
    tokens,
    pastTimeMarker: sentence.text.match(PAST_TIME_PATTERN)?.[0].toLowerCase() ?? null,
    hasHabitOrDuration: HABIT_OR_DURATION_PATTERN.test(sentence.text),
    // A past form right after "don't" or "can" is itself an error ("he don't came"), not proof the writer uses past tense.
    hasPastVerb: tokens.some(
      (token, index) =>
        PAST_AUXILIARIES.has(token.lower) ||
        (!BASE_VERB_TRIGGERS.has(tokens[index - 1]?.lower) &&
          Boolean(findVerbByForm(token.lower, [VERB_FORMS.past], { excludeForms: [VERB_FORMS.base] }))),
    ),
  }
}

export const checkTense = (text) => {
  const searchableText = normalizeApostrophes(text)

  return splitSentences(searchableText).flatMap((sentence) => {
    const context = createContext(searchableText, sentence)
    return TENSE_RULES.flatMap((rule) =>
      rule.find(context).map(({ from, to, replacements, explanation }) => {
        const offset = context.tokens[from].offset
        const original = text.slice(offset, context.tokens[to].end)
        return createSuggestion({
          engine: ENGINES.tense,
          source: SOURCES.localRule,
          category: rule.category,
          offset,
          original,
          replacements: replacements.map((replacement) => matchCase(original, replacement)),
          explanation,
        })
      }),
    )
  })
}
