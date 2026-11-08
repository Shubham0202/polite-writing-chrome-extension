import { lowerFirst } from '../../utils/textUtils.js'
import {
  APPROVAL_TEMPLATES,
  CLARIFICATION_TEMPLATES,
  CODE_REVIEW_TEMPLATES,
  DEADLINE_TEMPLATES,
  DISAGREEMENT_TEMPLATES,
  FOLLOW_UP_TEMPLATES,
  MEETING_TEMPLATES,
  REQUEST_TEMPLATES,
} from './toneTemplates.js'

export const SENTENCE_TYPES = Object.freeze({
  request: 'request',
  command: 'command',
  negativeCommand: 'negative-command',
  other: 'other',
})

export const REQUEST_PATTERN = /^(can|could|will|would)\s+you\s+(?:please\s+|kindly\s+)?(.+)$/is
export const NEGATIVE_COMMAND_PATTERN = /^(?:don't|don’t|do not)\s+(.+)$/is
// Rhetorical or already-soft requests that "Could you please" would make awkward.
const REQUEST_EXCEPTION_PATTERN = /^(?:mind|believe|imagine)\b/i
// "Send it, please" becomes "Could you please send it?", so the trailing "please" must go to avoid "please … please".
const TRAILING_PLEASE_PATTERN = /[,\s]+please$/i

const removeTrailingPlease = (text) => text.replace(TRAILING_PLEASE_PATTERN, '')

export const POLITE_TEMPLATES = {
  ...REQUEST_TEMPLATES,
  ...FOLLOW_UP_TEMPLATES,
  ...DEADLINE_TEMPLATES,
  ...CLARIFICATION_TEMPLATES,
  ...DISAGREEMENT_TEMPLATES,
  ...CODE_REVIEW_TEMPLATES,
  ...MEETING_TEMPLATES,
  ...APPROVAL_TEMPLATES,
}

// Sentence shapes that carry the user's own words ("You need to {update the API}"); the captured words are kept as written.
export const POLITE_PATTERN_TEMPLATES = [
  {
    // "You have to understand…" is a figure of speech, not a task.
    pattern: /^(?:you need to|you have to|you must|i want you to)\s+(?!understand|know|realize|remember|admit|agree|believe)(.+)$/is,
    build: ([, action]) => ({ body: `Could you please ${removeTrailingPlease(action)}`, terminal: '?' }),
    change: 'turned the demand into a polite request',
  },
  {
    pattern: /^please\s+(.+?)\s+(?:right\s+)?now$/is,
    build: ([, action]) => ({ body: `Could you please ${action} as soon as possible`, terminal: '?' }),
    change: 'softened "now" to "as soon as possible"',
  },
  {
    pattern: /^why\s+(?:didn['’]t|didnt|did not)\s+you\s+(.+)$/is,
    build: ([, action]) => ({ body: `Was there a reason you were not able to ${action}`, terminal: '?' }),
    change: 'asked for the reason instead of assigning blame',
  },
  {
    pattern: /^why\s+(are|were)\s+you\s+(.+)$/is,
    build: ([, be, rest]) => ({ body: `Could you help me understand why you ${be.toLowerCase()} ${rest}`, terminal: '?' }),
    change: 'asked for context instead of challenging',
  },
  {
    pattern: /^you should have\s+(.+)$/is,
    build: ([, action]) => ({ body: `It would have been helpful if you had ${action}`, terminal: '.' }),
    change: 'rephrased the criticism as feedback',
  },
  {
    pattern:
      /^(this|that|it)\s+(?:is not|isn['’]t|isnt)\s+((?:correct|right|accurate|complete|clear|valid|ready|fixed|working|what\s+(?:i|we)\s+(?:asked|expected|wanted|discussed))\b.*)$/is,
    build: ([, subject, expected]) => ({ body: `${subject} does not appear to be ${expected}`, terminal: '.' }),
    change: 'softened the statement with "does not appear to be"',
  },
]

export const POLITE_SENTENCE_TRANSFORMS = {
  [SENTENCE_TYPES.request]: (body) => {
    const [, , action] = body.match(REQUEST_PATTERN)
    if (REQUEST_EXCEPTION_PATTERN.test(action)) return null
    return { body: `Could you please ${removeTrailingPlease(action)}`, terminal: '?', change: 'softened the request with "Could you please"' }
  },
  [SENTENCE_TYPES.command]: (body) => ({
    body: `Could you please ${lowerFirst(removeTrailingPlease(body))}`,
    terminal: '?',
    change: 'turned the instruction into a polite request',
  }),
  [SENTENCE_TYPES.negativeCommand]: (body) => ({
    body: `Please do not ${removeTrailingPlease(body.match(NEGATIVE_COMMAND_PATTERN)[1])}`,
    terminal: '.',
    change: 'added "please" to the instruction',
  }),
  [SENTENCE_TYPES.other]: () => null,
}

export const POLITE_PHRASE_RULES = [
  { pattern: /\bi need you to\b/gi, replacement: 'I would appreciate it if you could', change: '"I need you to" → "I would appreciate it if you could"' },
  { pattern: /\bi want\b/gi, replacement: 'I would like', change: '"I want" → "I would like"' },
  { pattern: /(?<=\bplease\s+)tell me\b/gi, replacement: 'let me know', change: '"tell me" → "let me know"' },
  { pattern: /\binfo\b/gi, replacement: 'information', change: '"info" → "information"' },
  { pattern: /\basap\b/gi, replacement: 'as soon as possible', change: '"ASAP" → "as soon as possible"' },
  { pattern: /\bpl[sz]\b/gi, replacement: 'please', change: '"pls" → "please"' },
  { pattern: /\bthx\b/gi, replacement: 'thanks', change: '"thx" → "thanks"' },
]

export const POLITE_PROFILE = {
  templates: POLITE_TEMPLATES,
  templateChange: 'rephrased more politely',
  patternTemplates: POLITE_PATTERN_TEMPLATES,
  sentenceTransforms: POLITE_SENTENCE_TRANSFORMS,
  phraseRules: POLITE_PHRASE_RULES,
  apology: 'I apologize for the delay.',
}
