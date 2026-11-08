import { CATEGORIES, ENGINES, SOURCES } from '../../constants/corrections.js'
import { lookup } from '../../utils/lookup.js'
import {
  capitalizeFirst,
  hasOpenEnding,
  looksLikeQuestion,
  matchCase,
  normalizeApostrophes,
  splitSentences,
  tokenizeWords,
} from '../../utils/textUtils.js'
import { createSuggestion } from '../suggestion.js'

const SALUTATION_PATTERN =
  /^(sir|madam|ma'am|hi|hello|hey)(?=\s+(?:i|we|please|kindly|can|could|would|thank|thanks|sorry|this|my|our)\b)/i
const LIST_ITEM_PATTERN = /^(?:[-*•]|\d+[.)])\s/
const MIN_WORDS_FOR_FINAL_PERIOD = 4
// Words that start with a vowel letter but a consonant sound ("a user", "a one-time", "a USB").
const ARTICLE_EXCEPTION_PATTERN = /^(?:one|once|uni|use|usu|uti|ubiq|eu|uk|usb|ufo|u$)/i
// After a lone letter "a" ("option a is", "plan a or b") these words show it is a label, not the article.
const NOT_AFTER_ARTICLE = new Set([
  'is', 'or', 'and', 'as', 'at', 'in', 'on', 'of', 'if', 'it', 'its', 'an', 'are', 'also', 'all', 'any', 'into',
  'onto', 'until', 'unless', 'up', 'us', 'each', 'every', 'either', 'else',
])
const ALLOWED_REPEATED_WORDS = new Set(['that', 'had', 'is', 'bye', 'ha', 'no', 'so'])
const PRONOUN_BE = String.raw`(?:\b(?:i|you|we|they|he|she)\s+(?:am|is|are|was|were)|\b(?:i'm|you're|we're|they're|he's|she's))\s+`
const FEELING_PARTICIPLES = {
  worry: 'worried',
  confuse: 'confused',
  bore: 'bored',
  tire: 'tired',
  excite: 'excited',
  interest: 'interested',
  surprise: 'surprised',
  disappoint: 'disappointed',
  satisfy: 'satisfied',
  concern: 'concerned',
  scare: 'scared',
}

const regexRule = ({ id, category, pattern, replace, explanation }) => ({
  id,
  category,
  find: (text) =>
    Array.from(text.matchAll(pattern), (match) => ({
      offset: match.index,
      length: match[0].length,
      replacement: replace(match),
      explanation: typeof explanation === 'function' ? explanation(match) : explanation,
    })).filter(({ replacement }) => replacement !== null),
})

const sentenceRule = ({ id, category, findInSentence }) => ({
  id,
  category,
  find: (text) => splitSentences(text).flatMap((sentence) => findInSentence(sentence, text)),
})

const insertAtSentenceEnd = (sentence, mark) => {
  const end = sentence.offset + sentence.text.length
  return sentence.text.endsWith('.') ? { offset: end - 1, length: 1, replacement: mark } : { offset: end, length: 0, replacement: mark }
}

// Each rule replaces only the wrong word, so a separate fix on the subject (such as capitalizing "they") still applies.
const AGREEMENT_RULES = [
  regexRule({
    id: 'third-person-dont',
    category: CATEGORIES.grammar,
    pattern: /(?<=\b(?:he|she|it)\s+)(?:don't|dont|do not)\b/gi,
    replace: ([verb]) => matchCase(verb, verb.toLowerCase() === 'do not' ? 'does not' : "doesn't"),
    explanation: 'Use "doesn\'t" (does not) with he, she and it.',
  }),
  regexRule({
    id: 'plural-doesnt',
    category: CATEGORIES.grammar,
    pattern: /(?<=\b(?:i|you|we|they)\s+)(?:doesn't|doesnt|does not)\b/gi,
    replace: ([verb]) => matchCase(verb, verb.toLowerCase() === 'does not' ? 'do not' : "don't"),
    explanation: 'Use "don\'t" (do not) with I, you, we and they.',
  }),
  regexRule({
    id: 'plural-was',
    category: CATEGORIES.grammar,
    pattern: /(?<=\b(?:you|we|they)\s+)was\b/gi,
    replace: ([verb]) => matchCase(verb, 'were'),
    explanation: 'Use "were" with you, we and they.',
  }),
  regexRule({
    id: 'singular-are',
    category: CATEGORIES.grammar,
    pattern: /(?<=\b(?:he|she|it)\s+)are\b/gi,
    replace: ([verb]) => matchCase(verb, 'is'),
    explanation: 'Use "is" with he, she and it.',
  }),
  regexRule({
    id: 'i-am',
    category: CATEGORIES.grammar,
    pattern: /(?<=\bi\s+)(?:is|are)\b/gi,
    replace: ([verb]) => matchCase(verb, 'am'),
    explanation: 'Use "am" with I.',
  }),
  regexRule({
    id: 'plural-is',
    category: CATEGORIES.grammar,
    pattern: /(?<=\b(?:you|we|they)\s+)is\b/gi,
    replace: ([verb]) => matchCase(verb, 'are'),
    explanation: 'Use "are" with you, we and they.',
  }),
  regexRule({
    id: 'modal-of',
    category: CATEGORIES.grammar,
    pattern: /(?<=\b(could|should|would|must|might)\s+)of\b/gi,
    replace: ([word]) => matchCase(word, 'have'),
    explanation: ([, modal]) => `Write "${modal.toLowerCase()} have", not "${modal.toLowerCase()} of".`,
  }),
  regexRule({
    id: 'a-before-vowel',
    category: CATEGORIES.grammar,
    pattern: /\ba(?=\s+([aeiou][a-z]*)\b)/gi,
    replace: ([article, word]) =>
      /^[A-Z]/.test(word) || ARTICLE_EXCEPTION_PATTERN.test(word) || NOT_AFTER_ARTICLE.has(word.toLowerCase())
        ? null
        : matchCase(article, 'an'),
    explanation: ([, word]) => `Use "an" before a vowel sound, as in "an ${word}".`,
  }),
]

const VERB_FORM_RULES = [
  regexRule({
    id: 'feeling-participle',
    category: CATEGORIES.grammar,
    pattern: new RegExp(String.raw`(?<=${PRONOUN_BE}(?:not\s+|so\s+|very\s+|really\s+|too\s+)?)(?:${Object.keys(FEELING_PARTICIPLES).join('|')})\b`, 'gi'),
    replace: ([word]) => matchCase(word, lookup(FEELING_PARTICIPLES, word.toLowerCase())),
    explanation: ([word]) => `Use "${lookup(FEELING_PARTICIPLES, word.toLowerCase())}" to describe how someone feels.`,
  }),
  regexRule({
    id: 'supposed-used-to',
    category: CATEGORIES.grammar,
    pattern: new RegExp(String.raw`(?<=${PRONOUN_BE}(?:not\s+)?)(?:suppose|use)(?=\s+to\b)`, 'gi'),
    replace: ([word]) => `${word}d`,
    explanation: ([word]) => `Write "${word.toLowerCase()}d to" after am, is or are.`,
  }),
]

const PUNCTUATION_RULES = [
  sentenceRule({
    id: 'question-mark',
    category: CATEGORIES.punctuation,
    findInSentence: (sentence) => {
      const isQuestion = looksLikeQuestion(sentence.text)
      if (!isQuestion || /[?!]["'”’)\]]*$/.test(sentence.text) || hasOpenEnding(sentence.text)) return []
      return [{ ...insertAtSentenceEnd(sentence, '?'), explanation: 'This sentence is a question, so it should end with a question mark.' }]
    },
  }),
  sentenceRule({
    id: 'salutation-comma',
    category: CATEGORIES.punctuation,
    findInSentence: (sentence) => {
      const match = sentence.text.match(SALUTATION_PATTERN)
      if (!match) return []
      return [
        {
          offset: sentence.offset + match[0].length,
          length: 0,
          replacement: ',',
          explanation: `Add a comma after a greeting such as "${capitalizeFirst(match[1].toLowerCase())}".`,
        },
      ]
    },
  }),
  sentenceRule({
    id: 'final-period',
    category: CATEGORIES.punctuation,
    findInSentence: (sentence, text) => {
      const end = sentence.offset + sentence.text.length
      const endsParagraph = /^\s*(?:\n\s*\n|$)/.test(text.slice(end))
      const needsPeriod =
        endsParagraph &&
        /[A-Za-z0-9)"'”’]$/.test(sentence.text) &&
        !LIST_ITEM_PATTERN.test(sentence.text) &&
        !looksLikeQuestion(sentence.text) &&
        tokenizeWords(sentence.text).length >= MIN_WORDS_FOR_FINAL_PERIOD
      return needsPeriod ? [{ offset: end, length: 0, replacement: '.', explanation: 'End the sentence with a period.' }] : []
    },
  }),
  regexRule({
    id: 'space-before-punctuation',
    category: CATEGORIES.punctuation,
    pattern: /(?<=\w)[ \t]+(?=[,;!?.](?:\s|$))/g,
    replace: () => '',
    explanation: 'Remove the space before the punctuation mark.',
  }),
  regexRule({
    id: 'space-after-sentence',
    category: CATEGORIES.punctuation,
    pattern: /(?<=\p{Ll}{2}[.!?])(?=\p{Lu}\p{Ll})/gu,
    replace: () => ' ',
    explanation: 'Add a space before the next sentence.',
  }),
  regexRule({
    id: 'space-after-comma',
    category: CATEGORIES.punctuation,
    pattern: /(?<=[A-Za-z])[,;](?=[A-Za-z])/g,
    replace: ([mark]) => `${mark} `,
    explanation: 'Add a space after the comma.',
  }),
  regexRule({
    id: 'repeated-spaces',
    category: CATEGORIES.punctuation,
    pattern: /(?<=\S) {2,}(?=\S)/g,
    replace: () => ' ',
    explanation: 'Use a single space between words.',
  }),
]

const CAPITALIZATION_RULES = [
  sentenceRule({
    id: 'sentence-start-capital',
    category: CATEGORIES.capitalization,
    findInSentence: (sentence) => {
      const [firstWord] = tokenizeWords(sentence.text, sentence.offset)
      if (!firstWord) return []
      const leadingText = sentence.text.slice(0, firstWord.offset - sentence.offset)
      // The first chunk must be a plain word, so URLs, emails and "e.g." are left alone.
      const [firstChunk] = sentence.text.slice(leadingText.length).split(/\s/)
      const needsCapital =
        /^["'“‘([]*$/.test(leadingText) &&
        /^[a-z][a-z']*[,.!?;:]?$/.test(firstChunk) &&
        firstWord.lower !== 'i'
      if (!needsCapital) return []
      return [
        {
          offset: firstWord.offset,
          length: firstWord.text.length,
          replacement: capitalizeFirst(firstWord.text),
          explanation: 'Start each sentence with a capital letter.',
        },
      ]
    },
  }),
  regexRule({
    id: 'lowercase-i',
    category: CATEGORIES.capitalization,
    pattern: /(?<![\w'.-])i(?=(?:'(?:m|ve|ll|d))?(?:[\s,;:!?]|\.(?!\w)|$))/g,
    replace: () => 'I',
    explanation: 'Always write the pronoun "I" as a capital letter.',
  }),
]

const DUPLICATION_RULES = [
  regexRule({
    id: 'repeated-word',
    category: CATEGORIES.grammar,
    pattern: /\b([A-Za-z]+)\s+\1\b/gi,
    // A capitalized repeat is usually a name ("Bora Bora"), not a typo.
    replace: ([match, word]) =>
      ALLOWED_REPEATED_WORDS.has(word.toLowerCase()) || /^[A-Z]/.test(match.split(/\s+/).at(-1)) ? null : word,
    explanation: ([, word]) => `"${word}" is repeated.`,
  }),
]

// Order is priority: when two rules touch the same words, the earlier rule's suggestion is kept.
export const GRAMMAR_RULES = [
  ...AGREEMENT_RULES,
  ...VERB_FORM_RULES,
  ...PUNCTUATION_RULES,
  ...CAPITALIZATION_RULES,
  ...DUPLICATION_RULES,
]

export const checkGrammarRules = (text) => {
  const searchableText = normalizeApostrophes(text)
  return GRAMMAR_RULES.flatMap((rule) =>
    rule.find(searchableText).map(({ offset, length, replacement, explanation }) =>
      createSuggestion({
        engine: ENGINES.grammar,
        source: SOURCES.localRule,
        category: rule.category,
        offset,
        original: text.slice(offset, offset + length),
        replacements: [replacement],
        explanation,
      }),
    ),
  )
}
