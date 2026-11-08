import { POLITE_PATTERN_TEMPLATES, POLITE_PHRASE_RULES, POLITE_SENTENCE_TRANSFORMS, POLITE_TEMPLATES } from './politeRules.js'
import { ACKNOWLEDGEMENT_TEMPLATES, DEVELOPMENT_TEMPLATES, WORKPLACE_QUESTION_TEMPLATES } from './toneTemplates.js'

const CONTAINER_NOUNS =
  'ticket|document|doc|file|report|email|mail|sheet|spreadsheet|form|page|dashboard|record|system|database|portal|message|thread|attachment'
const OBJECT_WORDS = 'the|this|that|these|those|it|them|my|our|your|his|her|their'

// Runs before the polite phrase rules, so "ASAP" and "info" get their professional wording first.
const PROFESSIONAL_PHRASE_RULES = [
  {
    pattern: new RegExp(String.raw`\bthe\s+((?:[a-z]+\s+){0,2}?)(${CONTAINER_NOUNS})\s+info(?:rmation)?\b`, 'gi'),
    replacement: (_, modifiers, container) => `the information in the ${modifiers}${container}`,
    change: 'rephrased "… info" as "the information in …"',
  },
  // "check it out", "check the box" and "double-check" keep their own meaning.
  {
    pattern: new RegExp(String.raw`(?<!-)\bcheck(?=\s+(?:${OBJECT_WORDS})\b)(?!\s+\w+\s+out\b)(?!\s+\w+\s+(?:check)?box(?:es)?\b)`, 'gi'),
    replacement: 'review',
    change: '"check" → "review"',
  },
  {
    pattern: /\b(am|is|are|was|were)\s+not\s+able\s+to\b/gi,
    replacement: (_, be) => `${be} unable to`,
    change: '"not able to" → "unable to"',
  },
  { pattern: /\bfacing(?=\s+(?:an?|some)\s+(?:issue|problem|error)s?\b)/gi, replacement: 'experiencing', change: '"facing" → "experiencing"' },
  {
    pattern: /\bsome\s+(issue|error|problem)\b/gi,
    replacement: (_, noun) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`,
    change: '"some issue" → "an issue"',
  },
  { pattern: /\b(?:please\s+)?kindly(?:\s+please)?\b/gi, replacement: 'please', change: '"kindly" → "please"' },
  // "revert" without an object is Indian-English for "reply"; "revert the change" keeps its undo meaning.
  {
    pattern: new RegExp(String.raw`\brevert(?:\s+back)?\b(?!\s+(?:${OBJECT_WORDS}|to)\b)`, 'gi'),
    replacement: 'respond',
    change: '"revert" → "respond"',
  },
  { pattern: /\basap\b/gi, replacement: 'at your earliest convenience', change: '"ASAP" → "at your earliest convenience"' },
  { pattern: /\bgonna\b/gi, replacement: 'going to', change: '"gonna" → "going to"' },
  { pattern: /\bwanna\b/gi, replacement: 'want to', change: '"wanna" → "want to"' },
  { pattern: /\bgotta\b/gi, replacement: 'have to', change: '"gotta" → "have to"' },
  { pattern: /\b(?:yeah|yep)\b/gi, replacement: 'yes', change: '"yeah" → "yes"' },
  { pattern: /\bnope\b/gi, replacement: 'no', change: '"nope" → "no"' },
  { pattern: /^(?:hey|hi)\b(?!-)/i, replacement: 'Hello', change: '"Hi" → "Hello"' },
  { pattern: /\bthanks a lot\b/gi, replacement: 'thank you very much', change: '"thanks a lot" → "thank you very much"' },
  // "Thanks to the team" means "because of the team", so it is not a thank-you.
  { pattern: /(?<!\b(?:many|no)\s+)\b(?:thanks|thx)\b(?!\s+to\b)/gi, replacement: 'thank you', change: '"thanks" → "thank you"' },
  { pattern: /^sorry for\b/i, replacement: 'I apologize for', change: '"sorry" → "I apologize"' },
]

export const PROFESSIONAL_PROFILE = {
  templates: { ...POLITE_TEMPLATES, ...WORKPLACE_QUESTION_TEMPLATES, ...DEVELOPMENT_TEMPLATES, ...ACKNOWLEDGEMENT_TEMPLATES },
  templateChange: 'rephrased in a professional way',
  patternTemplates: POLITE_PATTERN_TEMPLATES,
  sentenceTransforms: POLITE_SENTENCE_TRANSFORMS,
  phraseRules: [...PROFESSIONAL_PHRASE_RULES, ...POLITE_PHRASE_RULES],
  apology: 'I apologize for the delay.',
}
