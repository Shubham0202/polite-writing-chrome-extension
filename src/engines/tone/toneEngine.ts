/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { CATEGORIES, ENGINES, SOURCES, TONES, type Tone } from '../../constants/corrections.ts'
import { UserFacingError } from '../../utils/errors.ts'
import { lookup } from '../../utils/lookup.ts'
import {
  capitalizeSentence,
  hasOpenEnding,
  looksLikeQuestion,
  lowerFirst,
  maskProtectedSpans,
  matchCase,
  normalizeApostrophes,
  splitSentences,
} from '../../utils/textUtils.ts'
import { createSuggestion, type IncludedCorrection, type Suggestion } from '../suggestion.ts'
import { NEGATIVE_COMMAND_PATTERN, POLITE_PROFILE, REQUEST_PATTERN, SENTENCE_TYPES } from './politeRules.ts'
import type { PhraseRule, SentenceType, ToneProfile, ToneTemplates, ToneTransform } from './politeRules.ts'
import { PROFESSIONAL_PROFILE } from './professionalRules.ts'

// Contractions are expanded so "I don't understand", "I dont understand" and "I do not understand" share one key.
const KEY_EXPANSIONS: Array<[pattern: RegExp, replacement: string]> = [
  [/\blet's\b/g, 'let us'],
  [/\bcan't\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/n't\b/g, ' not'],
  [/'m\b/g, ' am'],
  [/'re\b/g, ' are'],
  [/'s\b/g, ' is'],
  [/'ll\b/g, ' will'],
  [/'ve\b/g, ' have'],
  [/'/g, ''],
  [/\b(do|does|did|is|are|was|were|has|have|had|could|should|would)nt\b/g, '$1 not'],
  [/\bcant\b/g, 'cannot'],
  [/\bwont\b/g, 'will not'],
  [/\bim\b/g, 'i am'],
  [/\b(that|what|it)s\b/g, '$1 is'],
  [/\blets\b/g, 'let us'],
  [/\b(you|they)re\b/g, '$1 are'],
  [/\bcan not\b/g, 'cannot'],
]

export const toTemplateKey = (message: string): string =>
  KEY_EXPANSIONS.reduce(
    (key, [pattern, replacement]) => key.replace(pattern, replacement),
    normalizeApostrophes(message.toLowerCase())
      .replace(/[.!?]+$/, '')
      .replace(/^kindly\s+/, '')
      .replace(/[,\s]+please$/, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )

const createTemplateTable = (templates: ToneTemplates): Map<string, string> =>
  new Map(Object.entries(templates).map(([key, replacement]) => [toTemplateKey(key), replacement]))

// The prepared profile looks templates up by normalized key instead of by the phrase as written.
export interface PreparedToneProfile extends Omit<ToneProfile, 'templates'> {
  templates: Map<string, string>
}

const prepareProfile = (profile: ToneProfile): PreparedToneProfile => ({ ...profile, templates: createTemplateTable(profile.templates) })

const TONE_PROFILES: Record<Tone, PreparedToneProfile> = {
  [TONES.polite]: prepareProfile(POLITE_PROFILE),
  [TONES.professional]: prepareProfile(PROFESSIONAL_PROFILE),
}

const COMMAND_VERBS = new Set([
  'add', 'approve', 'arrange', 'attend', 'book', 'bring', 'call', 'change', 'check', 'close', 'come', 'complete',
  'confirm', 'contact', 'correct', 'create', 'delete', 'deploy', 'do', 'download', 'email', 'explain', 'find',
  'finish', 'fix', 'follow', 'forward', 'get', 'give', 'help', 'inform', 'investigate', 'join', 'keep', 'let',
  'look', 'make', 'merge', 'move', 'open', 'prepare', 'print', 'provide', 'push', 'remind', 'remove', 'reply',
  'resolve', 'respond', 'review', 'schedule', 'send', 'share', 'sign', 'start', 'stop', 'submit', 'take', 'tell',
  'test', 'update', 'upload', 'verify', 'wait', 'write',
])
// "Do you know…" without a question mark is a question; "Send it" is still a command, so "it" is not listed.
const SUBJECT_WORDS = new Set(['i', 'you', 'we', 'they', 'he', 'she'])
// Friendly set phrases that only look like commands.
const COMMAND_EXCEPTION_PATTERN = /^(?:take care|get well|keep up|keep it up|look forward|check it out|let's|let us)\b/i
// "Hi team, send me the report" — the greeting is kept and the message after it is rewritten.
const GREETING_PREFIX_PATTERN = /^((?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening)|sir|madam)\b[^,.!?]{0,30},\s*)(.+)$/is
const TERMINAL_PATTERN = /^(.*?)([.!?]+["'”’)\]]*)?$/s
const APOLOGY_PATTERN = /\b(?:sorry|apolog(?:y|ies|ize|ise))\b/i
// Only a missed task earns an apology "for the delay"; "I can't send you the money" is a refusal, not a delay.
const MISSED_TASK_PATTERN = /\b(?:not able to|unable to|couldn't|could not|can't|cannot)\s+(?:\w+\s+)?(?:complete|finish|submit|deliver)\b/i

const getProfile = (tone: unknown): PreparedToneProfile => {
  const profile = lookup(TONE_PROFILES, tone)
  if (!profile) throw new UserFacingError('This tone is not available.')
  return profile
}

const splitTerminal = (sentence: string): { body: string; terminal: string } => {
  const [, body, terminal = ''] = sentence.trim().match(TERMINAL_PATTERN)!
  return { body: body.trim(), terminal }
}

const detectSentenceType = (message: string, terminal: string): SentenceType => {
  if (REQUEST_PATTERN.test(message)) return SENTENCE_TYPES.request
  if (terminal.includes('?') || looksLikeQuestion(message)) return SENTENCE_TYPES.other
  if (NEGATIVE_COMMAND_PATTERN.test(message)) return SENTENCE_TYPES.negativeCommand

  const [firstWord, secondWord] = message.toLowerCase().split(/\s+/)
  const isCommand = COMMAND_VERBS.has(firstWord) && !SUBJECT_WORDS.has(secondWord) && !COMMAND_EXCEPTION_PATTERN.test(message)
  return isCommand ? SENTENCE_TYPES.command : SENTENCE_TYPES.other
}

interface PhraseRuleResult {
  text: string
  changes: string[]
}

const applyPhraseRules = (text: string, rules: readonly PhraseRule[]): PhraseRuleResult =>
  rules.reduce<PhraseRuleResult>(
    ({ text: current, changes }, rule) => {
      const rewritten = current.replace(rule.pattern, (match: string, ...groups: string[]) =>
        matchCase(match, typeof rule.replacement === 'function' ? rule.replacement(match, ...groups) : rule.replacement),
      )
      return { text: rewritten, changes: rewritten === current ? changes : [...changes, rule.change] }
    },
    { text, changes: [] },
  )

const findTransform = (message: string, terminal: string, profile: PreparedToneProfile): ToneTransform | null => {
  const patternTemplate = profile.patternTemplates.find(({ pattern }) => pattern.test(message))
  if (patternTemplate) return { ...patternTemplate.build(message.match(patternTemplate.pattern)!), change: patternTemplate.change }
  return profile.sentenceTransforms[detectSentenceType(message, terminal)](message)
}

interface MessageRewrite {
  text: string
  changes: string[]
  isTemplate: boolean
}

// Rewrites the message part of a sentence (after any greeting) and returns it with its final punctuation.
const rewriteMessage = (message: string, terminal: string, profile: PreparedToneProfile): MessageRewrite => {
  const template = profile.templates.get(toTemplateKey(message))
  if (template) return { text: template, changes: [profile.templateChange], isTemplate: true }

  const transform = findTransform(message, terminal, profile)
  const isTransformed = Boolean(transform) && transform!.body.toLowerCase() !== message.toLowerCase()
  const defaultTerminal = terminal || (looksLikeQuestion(message) ? '?' : '.')
  const finalTerminal = hasOpenEnding(message) ? terminal : (transform?.terminal ?? defaultTerminal)
  return {
    text: `${isTransformed ? transform!.body : message}${finalTerminal}`,
    changes: isTransformed ? [transform!.change] : [],
    isTemplate: false,
  }
}

const rewriteBody = (body: string, terminal: string, profile: PreparedToneProfile): PhraseRuleResult => {
  const [, greeting = '', message = body] = body.match(GREETING_PREFIX_PATTERN) ?? []
  const rewrittenMessage = rewriteMessage(message, terminal, profile)
  // Curated template sentences are final; phrase rules only adjust the user's own words.
  const phrasedMessage = rewrittenMessage.isTemplate
    ? { text: rewrittenMessage.text, changes: [] }
    : applyPhraseRules(rewrittenMessage.text, profile.phraseRules)
  const phrasedGreeting = applyPhraseRules(greeting, profile.phraseRules)
  const text = greeting ? `${phrasedGreeting.text}${lowerFirst(phrasedMessage.text)}` : phrasedMessage.text

  return {
    text: capitalizeSentence(text),
    changes: [...rewrittenMessage.changes, ...phrasedGreeting.changes, ...phrasedMessage.changes],
  }
}

const formatExplanation = (changes: readonly string[]): string => `${changes.join('; ').replace(/^\p{Ll}/u, (letter: string) => letter.toUpperCase())}.`

const rewriteSentence = (sentence: string, profile: PreparedToneProfile, canAddApology: boolean): SentenceRewrite | null => {
  const { masked, unmask } = maskProtectedSpans(sentence)
  const { body, terminal } = splitTerminal(masked)
  if (!body) return null

  const rewritten = rewriteBody(body, terminal, profile)
  // The apology is added once per text, after the first sentence that explains a missed task.
  const addsApology = canAddApology && MISSED_TASK_PATTERN.test(normalizeApostrophes(body))
  const changes = addsApology ? [...rewritten.changes, 'added an apology for the delay'] : rewritten.changes
  if (!changes.length) return null

  const text = unmask(addsApology ? `${rewritten.text} ${profile.apology}` : rewritten.text)
  return text === sentence ? null : { text, explanation: formatExplanation(changes), addedApology: addsApology }
}

// Rewrites each sentence in order; returns null for sentences that need no tone change.
export interface SentenceRewrite {
  text: string
  explanation: string
  addedApology: boolean
}

export const rewriteSentences = (
  sentences: readonly string[],
  tone: unknown,
  { allowApology }: { allowApology: boolean },
): Array<SentenceRewrite | null> => {
  const profile = getProfile(tone)
  let canAddApology = allowApology

  return sentences.map((sentence) => {
    const rewrite = rewriteSentence(sentence, profile, canAddApology)
    if (rewrite?.addedApology) canAddApology = false
    return rewrite
  })
}

export const containsApology = (text: string): boolean => APOLOGY_PATTERN.test(text)

export interface ToneSuggestionInput {
  offset: number
  original: string
  rewrite: Pick<SentenceRewrite, 'text' | 'explanation'>
  includedCorrections?: IncludedCorrection[]
}

export const createToneSuggestion = ({ offset, original, rewrite, includedCorrections = [] }: ToneSuggestionInput): Suggestion =>
  createSuggestion({
    engine: ENGINES.tone,
    source: SOURCES.localRule,
    category: CATEGORIES.tone,
    offset,
    original,
    replacements: [rewrite.text],
    explanation: rewrite.explanation,
    includedCorrections,
  })

export const checkTone = (text: string, tone: unknown): Suggestion[] => {
  const sentences = splitSentences(text)
  const rewrites = rewriteSentences(
    sentences.map((sentence) => sentence.text),
    tone,
    { allowApology: !containsApology(text) },
  )

  return sentences.flatMap((sentence, index) =>
    rewrites[index] ? [createToneSuggestion({ offset: sentence.offset, original: sentence.text, rewrite: rewrites[index] })] : [],
  )
}
