import { REWRITE_STYLES } from '../../constants/ai.js'
import { CATEGORIES, ENGINES, SOURCES } from '../../constants/corrections.js'
import { applyEdits } from '../../utils/diffUtils.js'
import { findProtectedRanges, splitSentences, tokenizeWords } from '../../utils/textUtils.js'
import { createSuggestion } from '../suggestion.js'

export const REWRITE_STYLE_EXPLANATION = {
  [REWRITE_STYLES.improveWording]: 'Rewritten with more natural wording.',
  [REWRITE_STYLES.professional]: 'Rewritten in a professional tone.',
  [REWRITE_STYLES.polite]: 'Rewritten to sound more polite.',
  [REWRITE_STYLES.concise]: 'Rewritten to be more concise.',
  [REWRITE_STYLES.friendly]: 'Rewritten in a friendlier tone.',
  [REWRITE_STYLES.clarity]: 'Rewritten to be clearer.',
}

// Function words say nothing about what a sentence is about, so only the other words count when comparing sentences.
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'to', 'of', 'in', 'on', 'at', 'for', 'by', 'with', 'from', 'as', 'if',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could',
  'should', 'may', 'might', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'she', 'it', 'its', 'they', 'them', 'their',
  'this', 'that', 'these', 'those', 'please', 'not', 'no',
])

// Models routinely collapse double spaces and drop trailing line breaks; that is not a change worth showing.
const collapseWhitespace = (value) => value.replace(/\s+/g, ' ').trim()
const countLineBreaks = (value) => (value.match(/\n/g) ?? []).length

// Template and mail-merge placeholders the model must copy as they are: {{first_name}}, ${amount}, {name}, {0},
// [order_id], %s, %1$s.
const PLACEHOLDER_PATTERN = /\{\{\s*[^{}\n]+?\s*\}\}|\$\{[^{}\n]+\}|\{[\w.-]+\}|\[[A-Za-z_][\w.-]*\]|%(?:\d+\$)?[sd]/g
// An emoji, a smart quote or an ellipsis glued to the end of a link is not part of the link.
const TRAILING_DECORATION_PATTERN = /(?:[\p{Extended_Pictographic}\uFE0F\u200D]|[“”‘’«»…])+$/u
const OUTER_WHITESPACE_PATTERN = /^(\s*)[\s\S]*?(\s*)$/
// Digits with their inner separators, so "10:30", "1,000" and "2.5" each count as one number.
const NUMBER_PATTERN = /\d+(?:[.,:]\d+)*/g

const toContentWords = (sentence) => tokenizeWords(sentence).map(({ lower }) => lower).filter((word) => !FUNCTION_WORDS.has(word))

const toProtectedSpans = (value) =>
  findProtectedRanges(value)
    .map(([start, end]) => value.slice(start, end).replace(TRAILING_DECORATION_PATTERN, ''))
    .filter(Boolean)

const toPlaceholders = (value) => value.match(PLACEHOLDER_PATTERN) ?? []

const toSuggestion = (style, { offset, original, replacement }) =>
  createSuggestion({
    engine: ENGINES.rewrite,
    source: SOURCES.ai,
    category: CATEGORIES.wording,
    offset,
    original,
    replacements: [replacement],
    explanation: REWRITE_STYLE_EXPLANATION[style],
  })

// A rewritten sentence that contains a content word from a different original sentence, but not from its own, is the
// signature of sentences being merged, split or re-ordered; pairing them by position would then mislead.
const hasBorrowedWords = (pairs) => {
  const ownWords = pairs.map(({ sentence }) => new Set(toContentWords(sentence.text)))
  return pairs.some(({ replacement }, index) =>
    toContentWords(replacement).some((word) => !ownWords[index].has(word) && ownWords.some((words, other) => other !== index && words.has(word))),
  )
}

// Dropped whitespace is model noise, but added paragraph breaks are a deliberate change the user should see.
export const isUnchangedRewrite = (text, rewritten) =>
  collapseWhitespace(rewritten) === collapseWhitespace(text) && countLineBreaks(rewritten) <= countLineBreaks(text)

// Models often answer with curly quotes and apostrophes; a writer who typed straight ones gets them back straight.
export const matchQuoteStyle = (text, rewritten) => (/[‘’“”]/.test(text) ? rewritten : rewritten.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'))

// The prompt and the parser trim the text, so the writer's own leading and trailing whitespace goes back around it.
export const createWholeTextSuggestion = (text, rewritten, style) => {
  const [, leading, trailing] = text.match(OUTER_WHITESPACE_PATTERN)
  return toSuggestion(style, { offset: 0, original: text, replacement: `${leading}${rewritten}${trailing}` })
}

// Pairs the sentences by position so each one can be accepted or rejected on its own. The pairing only counts when
// the counts match, no sentence borrows words from another, and accepting every pair gives back the model's text
// (whitespace aside, so the user's own spacing and line breaks are kept). Otherwise the caller offers the whole text.
export const alignRewriteBySentence = (text, rewritten, style) => {
  const sentences = splitSentences(text)
  const rewrittenSentences = splitSentences(rewritten)
  if (sentences.length < 2 || sentences.length !== rewrittenSentences.length) return null

  const pairs = sentences.map((sentence, index) => ({ sentence, replacement: rewrittenSentences[index].text }))
  if (hasBorrowedWords(pairs)) return null

  const edits = pairs
    .filter(({ sentence, replacement }) => sentence.text !== replacement)
    .map(({ sentence, replacement }) => ({ offset: sentence.offset, length: sentence.text.length, original: sentence.text, replacement }))
  if (collapseWhitespace(applyEdits(text, edits)) !== collapseWhitespace(rewritten)) return null

  // createSuggestion matches the writer's apostrophe style, which can leave a replacement identical to its original.
  return edits.map((edit) => toSuggestion(style, edit)).filter((suggestion) => suggestion.replacements.length > 0)
}

// Links, email addresses, mentions, tags, code and placeholders from the text that the rewrite no longer contains as written.
export const findMissingProtectedSpans = (text, rewritten) => [...toProtectedSpans(text), ...toPlaceholders(text)].filter((span) => !rewritten.includes(span))

// Numbers the rewrite altered: any it contains that the text does not, and multi-digit ones it dropped. A single
// dropped digit is left alone, because "2 days" before "Thursday and Friday" is the one drop the prompt allows.
export const findChangedNumbers = (text, rewritten) => {
  const before = text.match(NUMBER_PATTERN) ?? []
  const after = rewritten.match(NUMBER_PATTERN) ?? []
  const added = after.filter((number) => !before.includes(number))
  const dropped = before.filter((number) => number.length > 1 && !after.includes(number))
  return [...new Set([...added, ...dropped])]
}

// Links, email addresses, mentions and tags in the rewrite that were not in the text: hallucinated, or injected by the
// text itself. Code in backticks is left out, because models often add code formatting to an identifier in prose.
export const findAddedProtectedSpans = (text, rewritten) => {
  const unmatched = toProtectedSpans(text)
  return toProtectedSpans(rewritten).filter((span) => {
    const index = unmatched.indexOf(span)
    if (index !== -1) {
      unmatched.splice(index, 1)
      return false
    }
    return !span.startsWith('`')
  })
}
