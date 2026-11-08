/** @author Shubham Chandgude <shubham826852@gmail.com> */

const WORD_PATTERN = /\p{L}+(?:['’]\p{L}+)*/gu
// A sentence ends at . ! ? before whitespace, at a line break, or where a period is glued to the next sentence ("it.Thanks").
const SENTENCE_BOUNDARY_PATTERN = /[.!?]+["'”’)\]]*(?=\s|$)|(?<=\p{Ll}{2}[.!?])(?=\p{Lu}\p{Ll})|\n/gu
const SENTENCE_END_PATTERN = /(?:[.!?]["'”’)\]]*|\n)$/
const QUESTION_START_PATTERN =
  /^(?:(?:can|could|would|will|should|shall|is|are|was|were|may|might)\s+(?:i|you|we|they|he|she|it)\b|(?:do|does|did|have|has|had)\s+(?:i|you|we|they|he|she)\b|(?:does|did|has|had)\s+it\b|(?:what|why|how|where|when|who|which)\s+(?:is|are|was|were|do|does|did|can|could|will|would|should|have|has)\b)/i
// Also dotted initialisms ("U.S.", "e.g."), which a list could never finish.
const ABBREVIATION_PATTERN =
  /(?:^|\s)(?:e\.g|i\.e|a\.m|p\.m|vs|mr|mrs|ms|dr|prof|sr|jr|st|approx|etc|inc|ltd|co|corp|dept|est|fig|vol)\.$|(?:\p{L}\.){2,}$/iu
// "No." is an abbreviation only before a number ("No. 5"); otherwise it ends a sentence ("I said no.").
const NUMBER_ABBREVIATION_PATTERN = /(?:^|\s)no\.$/i
// Text that must never be edited: inline code, URLs, emails, @mentions and #tags.
const PROTECTED_SPAN_PATTERN = /`[^`\n]+`|\b(?:https?:\/\/|www\.)[^\s]*[^\s.,;:!?)\]'"]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|(?<!\w)[@#][\w-]+/g
const PLACEHOLDER_PATTERN = /\uE000(\d+)\uE001/g
// Lead-ins ("check the following:") and trailing-off sentences ("the doc\u2026") take no final punctuation.
const OPEN_ENDING_PATTERN = /(?:[:;,\u2026]|\.\.)$/

// Curly and straight apostrophes are both one character, so swapping them keeps every offset valid.
export const normalizeApostrophes = (text) => text.replace(/’/g, "'")

const isAllCaps = (word) => word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()

export const capitalizeFirst = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// Capitalizes only a plain lowercase first word, so "iPhone" and "npm" style names are left alone.
export const capitalizeSentence = (text) => (/^\p{Ll}[\p{Ll}'’]*(?=[\s,.!?;:]|$)/u.test(text) ? capitalizeFirst(text) : text)

// Leaves "I", "I'm" and acronyms ("SEND", "PR") alone, since lowercasing them would be wrong.
export const lowerFirst = (text) => {
  const [firstWord = ''] = text.split(/\s/)
  if (/^I(?:['’]\p{L}+)?$/u.test(firstWord) || isAllCaps(firstWord)) return text
  return text.charAt(0).toLowerCase() + text.slice(1)
}

// Acronyms such as "ASAP" say nothing about the case of their replacement, so only a capitalized word passes it on.
export const matchCase = (source, target) => {
  const [firstWord = ''] = source.split(/\s/)
  return /^\p{Lu}/u.test(firstWord) && !isAllCaps(firstWord) ? capitalizeFirst(target) : target
}

export const tokenizeWords = (text, baseOffset = 0) =>
  Array.from(text.matchAll(WORD_PATTERN), (match) => ({
    text: match[0],
    lower: normalizeApostrophes(match[0].toLowerCase()),
    offset: baseOffset + match.index,
    end: baseOffset + match.index + match[0].length,
  }))

const toSentence = (text, start, end) => {
  const raw = text.slice(start, end)
  const body = raw.trim()
  return body ? { text: body, offset: start + raw.length - raw.trimStart().length } : null
}

const endsWithAbbreviation = (text, start, end) => {
  const candidate = text.slice(start, end)
  return ABBREVIATION_PATTERN.test(candidate) || (NUMBER_ABBREVIATION_PATTERN.test(candidate) && /^\s*\d/.test(text.slice(end)))
}

export const splitSentences = (text) => {
  const sentences = []
  let start = 0

  for (const match of text.matchAll(SENTENCE_BOUNDARY_PATTERN)) {
    const end = match.index + match[0].length
    if (match[0] !== '\n' && endsWithAbbreviation(text, start, end)) continue

    const sentence = toSentence(text, start, end)
    if (sentence) sentences.push(sentence)
    start = end
  }

  const lastSentence = toSentence(text, start, text.length)
  if (lastSentence) sentences.push(lastSentence)
  return sentences
}

export const isSentenceStart = (text, offset) => {
  const preceding = text.slice(0, offset).replace(/[ \t]+$/, '')
  return !preceding.trim() || SENTENCE_END_PATTERN.test(preceding)
}

export const looksLikeQuestion = (text) => QUESTION_START_PATTERN.test(normalizeApostrophes(text))

export const hasOpenEnding = (text) => OPEN_ENDING_PATTERN.test(text)

export const findProtectedRanges = (text) =>
  Array.from(text.matchAll(PROTECTED_SPAN_PATTERN), (match) => [match.index, match.index + match[0].length])

// Swaps protected spans for placeholders that no rule matches, so rewrites cannot alter URLs or emails.
export const maskProtectedSpans = (text) => {
  const spans = []
  const masked = text.replace(PROTECTED_SPAN_PATTERN, (span) => `\uE000${spans.push(span) - 1}\uE001`)
  return { masked, unmask: (value) => value.replace(PLACEHOLDER_PATTERN, (_, index) => spans[Number(index)]) }
}
