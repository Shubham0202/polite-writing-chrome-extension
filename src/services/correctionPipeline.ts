/** @author Shubham Chandgude <shubham826852@gmail.com> */

import {
  CORRECTION_ACTIONS,
  ENGINES,
  ENGINE_STATUS,
  SOURCES,
  TONES,
  TONE_LABEL,
  type CorrectionAction,
  type EngineStatus,
  type Source,
  type Tone,
} from '../constants/corrections.ts'
import { DEFAULT_SETTINGS, type Settings } from '../constants/settings.ts'
import { checkWithLanguageTool, type LanguageToolOptions } from '../engines/grammar/languageTool.ts'
import { checkGrammarRules } from '../engines/grammar/grammarRules.ts'
import type { SpellChecker } from '../engines/spelling/spellChecker.ts'
import { applyDefaultSuggestions, isAcceptedByDefault, type IdentifiedSuggestion, type IncludedCorrection, type Suggestion } from '../engines/suggestion.ts'
import { checkTense } from '../engines/tense/tenseEngine.ts'
import { checkTone, containsApology, createToneSuggestion, rewriteSentences } from '../engines/tone/toneEngine.ts'
import { applyEdits, removeOverlaps } from '../utils/diffUtils.ts'
import { devError } from '../utils/devLog.ts'
import { UserFacingError } from '../utils/errors.ts'
import { lookup } from '../utils/lookup.ts'
import { getTextValidationError } from '../utils/textValidation.ts'
import { splitSentences, type Sentence } from '../utils/textUtils.ts'
import { dropRedundantPunctuation, validateSuggestions } from './resultValidator.ts'

// Targeted local rules win over LanguageTool where both touch the same words: they are written to keep meaning
// ("they was" → "they were", where LanguageTool's first suggestion is "they are").
// Checks on websites run after every pause in typing, so a LanguageTool server that failed is left alone for this long.
const INLINE_LANGUAGE_TOOL_RETRY_MS = 60_000

export interface CorrectionRequest {
  text: string
  action: CorrectionAction
  tone?: Tone
  isOnlineGrammarEnabled?: boolean
  signal?: AbortSignal
}

export interface EngineReport {
  label: string
  status: EngineStatus
  message: string | null
}

export type ToneAlternatives = Record<Tone, IdentifiedSuggestion[]>

export interface CorrectionResult {
  action: CorrectionAction
  tone: Tone
  original: string
  corrected: string
  suggestions: IdentifiedSuggestion[]
  engines: EngineReport[]
  // Only the inline check offers tone rewrites beside the corrections.
  toneAlternatives?: ToneAlternatives
}

export interface InlineCheckResult extends CorrectionResult {
  toneAlternatives: ToneAlternatives
}

export interface CorrectionPipelineOptions {
  getSpellChecker: () => SpellChecker
  getIgnoredWords?: () => Promise<readonly string[]>
  getSettings?: () => Promise<Readonly<Settings>>
  languageToolOptions: LanguageToolOptions
  onlineLanguageToolOptions: LanguageToolOptions
  // Whether the LanguageTool server on this computer may be asked. Off unless the user set it up, because whatever
  // program listens at its address receives the text.
  isLocalLanguageToolAllowed?: () => Promise<boolean>
}

export type InlineCheckRequest = CorrectionRequest & { action: typeof CORRECTION_ACTIONS.inlineCheck }

// An inline-check request always resolves with tone alternatives; every other action resolves without them.
export interface CorrectionPipeline {
  (request: InlineCheckRequest): Promise<InlineCheckResult>
  (request: CorrectionRequest): Promise<CorrectionResult>
}

interface LanguageToolEngine {
  label: string
  check: (text: string) => Promise<Suggestion[]>
}

// `check` returns a list of suggestions, or { suggestions, message } when the engine ran with a caveat.
type EngineOutput = Suggestion[] | { suggestions: Suggestion[]; message?: string | null }

interface EngineRunOptions {
  failureStatus?: EngineStatus
  fallbackMessage?: string
}

interface EngineRun {
  suggestions: Suggestion[]
  report: EngineReport
}

interface CorrectionOutcome {
  suggestions: Suggestion[]
  reports: EngineReport[]
  toneAlternatives?: ToneAlternatives
}

interface ActionContext {
  tone: Tone
  // Null when no LanguageTool server may be asked: grammar then comes from the built-in rules alone.
  languageTool: LanguageToolEngine | null
  canUseLocalLanguageTool: boolean
  signal: AbortSignal | undefined
}

type ActionHandler = (text: string, context: ActionContext) => Promise<CorrectionOutcome>

const TONE_SETTING: Record<Tone, 'isPoliteEnabled' | 'isProfessionalEnabled'> = {
  [TONES.polite]: 'isPoliteEnabled',
  [TONES.professional]: 'isProfessionalEnabled',
}

// The AI source only appears on rewrite suggestions, which never pass through this pipeline, so it has no priority.
const SOURCE_PRIORITY = {
  [SOURCES.localRule]: 1,
  [SOURCES.languageTool]: 2,
  [SOURCES.dictionary]: 3,
} as Record<Source, number>

const rankSuggestion = (suggestion: Suggestion): number => (suggestion.engine === ENGINES.tone ? 0 : SOURCE_PRIORITY[suggestion.source])

const runEngine = async (
  label: string,
  check: () => EngineOutput | Promise<EngineOutput>,
  { failureStatus = ENGINE_STATUS.failed, fallbackMessage = '' }: EngineRunOptions = {},
): Promise<EngineRun> => {
  try {
    const output = await check()
    const { suggestions, message = null } = Array.isArray(output) ? { suggestions: output } : output
    return { suggestions, report: { label, status: ENGINE_STATUS.used, message } }
  } catch (error) {
    if (!(error instanceof UserFacingError)) devError(`${label} failed`, error)
    const reason = error instanceof UserFacingError ? error.message : `${label} could not run.`
    return { suggestions: [], report: { label, status: failureStatus, message: `${reason} ${fallbackMessage}`.trim() } }
  }
}

const isInside = (suggestion: Suggestion, sentence: Sentence): boolean => {
  const sentenceEnd = sentence.offset + sentence.text.length
  // A space inserted right after a sentence separates it from the next one, so it is not part of the rewrite.
  const isSpaceAfterSentence = suggestion.length === 0 && suggestion.offset === sentenceEnd && !suggestion.replacements[0]?.trim()
  return !isSpaceAfterSentence && suggestion.offset >= sentence.offset && suggestion.offset + suggestion.length <= sentenceEnd
}

// Two lowercase "i"s produce the same explanation twice; list each kind of fix once.
const describeCorrections = (corrections: readonly Suggestion[]): IncludedCorrection[] => [
  ...new Map(corrections.map(({ category, explanation }) => [explanation, { category, explanation }])).values(),
]

// For "Fix Everything": each sentence is corrected first, then rewritten in the requested tone. A rewritten
// sentence becomes one suggestion that includes the corrections inside it, so nothing is applied twice.
const mergeToneIntoCorrections = (text: string, corrections: readonly Suggestion[], tone: Tone): Suggestion[] => {
  const sentences = splitSentences(text)
  const correctionsBySentence = sentences.map((sentence) =>
    corrections.filter((suggestion) => isInside(suggestion, sentence) && isAcceptedByDefault(suggestion)),
  )
  const correctedSentences = sentences.map((sentence, index) =>
    applyEdits(
      sentence.text,
      correctionsBySentence[index].map((suggestion) => ({
        offset: suggestion.offset - sentence.offset,
        length: suggestion.length,
        replacement: suggestion.replacements[0],
      })),
    ),
  )
  const rewrites = rewriteSentences(correctedSentences, tone, { allowApology: !containsApology(text) })

  const toneSuggestions = sentences.flatMap((sentence, index) =>
    rewrites[index]
      ? [
          createToneSuggestion({
            offset: sentence.offset,
            original: sentence.text,
            rewrite: rewrites[index],
            includedCorrections: describeCorrections(correctionsBySentence[index]),
          }),
        ]
      : [],
  )
  const absorbedCorrections = new Set(correctionsBySentence.flatMap((sentenceCorrections, index) => (rewrites[index] ? sentenceCorrections : [])))
  return [...toneSuggestions, ...corrections.filter((suggestion) => !absorbedCorrections.has(suggestion))]
}

export const createCorrectionPipeline = ({
  getSpellChecker,
  getIgnoredWords = async () => [],
  getSettings = async () => DEFAULT_SETTINGS,
  languageToolOptions,
  onlineLanguageToolOptions,
  isLocalLanguageToolAllowed = async () => false,
}: CorrectionPipelineOptions): CorrectionPipeline => {
  const localLanguageTool: LanguageToolEngine = {
    label: 'Grammar (LanguageTool)',
    check: (text: string) => checkWithLanguageTool(text, languageToolOptions),
  }
  const onlineLanguageTool: LanguageToolEngine = {
    label: 'Grammar (LanguageTool online)',
    check: (text: string) => checkWithLanguageTool(text, onlineLanguageToolOptions),
  }
  let inlineLanguageToolRetryAt = 0

  // For the popup buttons: the online service while its switch is on, otherwise the server on this computer if the
  // user set one up, otherwise none.
  const chooseLanguageTool = (isOnlineGrammarEnabled: boolean, canUseLocalLanguageTool: boolean): LanguageToolEngine | null => {
    if (isOnlineGrammarEnabled) return onlineLanguageTool
    return canUseLocalLanguageTool ? localLanguageTool : null
  }

  const createInlineLanguageTool = (signal: AbortSignal | undefined): LanguageToolEngine => ({
    label: localLanguageTool.label,
    check: async (text: string) => {
      if (Date.now() < inlineLanguageToolRetryAt) throw new UserFacingError('LanguageTool failed recently, so it was skipped for now.')
      try {
        return await checkWithLanguageTool(text, { ...languageToolOptions, signal })
      } catch (error) {
        if (!signal?.aborted) inlineLanguageToolRetryAt = Date.now() + INLINE_LANGUAGE_TOOL_RETRY_MS
        throw error
      }
    },
  })

  const runSpelling = (text: string): Promise<EngineRun> =>
    runEngine('Spelling (nspell)', async () => {
      const { suggestions, isComplete } = getSpellChecker()(text, { ignoredWords: await getIgnoredWords() })
      return { suggestions, message: isComplete ? null : 'Only the first part was spell-checked because the text has many unknown words.' }
    })

  const runGrammar = (text: string, languageTool: LanguageToolEngine | null): Promise<EngineRun>[] => [
    ...(languageTool
      ? [
          runEngine(languageTool.label, () => languageTool.check(text), {
            failureStatus: ENGINE_STATUS.unavailable,
            fallbackMessage: 'Grammar was checked with local rules only.',
          }),
        ]
      : []),
    runEngine('Grammar (local rules)', () => checkGrammarRules(text)),
    runEngine('Tense rules', () => checkTense(text)),
  ]

  // The switches are for checks that run by themselves; a popup button is an explicit request, so it always runs everything.
  const runCorrections = async (
    text: string,
    languageTool: LanguageToolEngine | null,
    { isSpellingEnabled, isGrammarEnabled }: Readonly<Settings> = DEFAULT_SETTINGS,
  ): Promise<CorrectionOutcome> => {
    const results = await Promise.all([
      ...(isSpellingEnabled ? [runSpelling(text)] : []),
      ...(isGrammarEnabled ? runGrammar(text, languageTool) : []),
    ])
    return {
      suggestions: results.flatMap((result) => result.suggestions),
      reports: results.map((result) => result.report),
    }
  }

  const runValidatedCorrections = async (text: string, languageTool: LanguageToolEngine | null, settings?: Readonly<Settings>): Promise<CorrectionOutcome> => {
    const { suggestions, reports } = await runCorrections(text, languageTool, settings)
    return { suggestions: removeOverlaps(validateSuggestions(text, suggestions), rankSuggestion), reports }
  }

  const runTone = async (text: string, tone: Tone): Promise<CorrectionOutcome> => {
    const { suggestions, report } = await runEngine(`${TONE_LABEL[tone]} tone rules`, () => checkTone(text, tone))
    return { suggestions, reports: [report] }
  }

  const runFixEverything = async (text: string, tone: Tone, languageTool: LanguageToolEngine | null): Promise<CorrectionOutcome> => {
    const corrections = await runValidatedCorrections(text, languageTool)
    const { suggestions, report } = await runEngine(`${TONE_LABEL[tone]} tone rules`, () =>
      mergeToneIntoCorrections(text, corrections.suggestions, tone),
    )
    return {
      suggestions: report.status === ENGINE_STATUS.used ? suggestions : corrections.suggestions,
      reports: [...corrections.reports, report],
    }
  }

  // A rewrite overlaps the corrections in its sentence and already includes them, so it is offered beside them, not merged in.
  const runToneAlternatives = async (
    text: string,
    corrections: readonly Suggestion[],
    tone: Tone,
  ): Promise<{ tone: Tone; suggestions: IdentifiedSuggestion[]; report: EngineReport }> => {
    const { suggestions, report } = await runEngine(`${TONE_LABEL[tone]} tone rules`, () =>
      validateSuggestions(text, mergeToneIntoCorrections(text, corrections, tone)).filter(({ engine }) => engine === ENGINES.tone),
    )
    return { tone, suggestions: suggestions.map((suggestion, index) => ({ ...suggestion, id: `${tone}-${index}` })), report }
  }

  const runInlineCheck = async (text: string, languageTool: LanguageToolEngine | null): Promise<CorrectionOutcome> => {
    const settings = await getSettings()
    const corrections = await runValidatedCorrections(text, languageTool, settings)
    const enabledTones = Object.values(TONES).filter((tone) => settings[TONE_SETTING[tone]])
    const alternatives = await Promise.all(enabledTones.map((tone) => runToneAlternatives(text, corrections.suggestions, tone)))
    const noRewrites = Object.fromEntries(Object.values(TONES).map((tone) => [tone, []]))
    return {
      suggestions: corrections.suggestions,
      reports: [...corrections.reports, ...alternatives.map(({ report }) => report)],
      // noRewrites holds an entry for every tone, so the merged object has all of them.
      toneAlternatives: { ...noRewrites, ...Object.fromEntries(alternatives.map(({ tone, suggestions }) => [tone, suggestions])) } as ToneAlternatives,
    }
  }

  const ACTION_HANDLERS: Record<CorrectionAction, ActionHandler> = {
    [CORRECTION_ACTIONS.fixGrammar]: (text: string, { languageTool }: ActionContext) => runCorrections(text, languageTool),
    [CORRECTION_ACTIONS.makePolite]: (text: string) => runTone(text, TONES.polite),
    [CORRECTION_ACTIONS.professional]: (text: string) => runTone(text, TONES.professional),
    [CORRECTION_ACTIONS.fixEverything]: (text: string, { tone, languageTool }: ActionContext) => runFixEverything(text, tone, languageTool),
    // Inline checks run without the user asking, so they never use the online service, whatever the popup switch says.
    [CORRECTION_ACTIONS.inlineCheck]: (text: string, { canUseLocalLanguageTool, signal }: ActionContext) =>
      runInlineCheck(text, canUseLocalLanguageTool ? createInlineLanguageTool(signal) : null),
  }

  // One implementation serves both overloads: an inline check always comes back with its tone alternatives.
  const runPipeline = async ({ text, action, tone = TONES.polite, isOnlineGrammarEnabled = false, signal }: CorrectionRequest = {} as CorrectionRequest): Promise<CorrectionResult> => {
    const inputError = getTextValidationError(text)
    if (inputError) throw new UserFacingError(inputError)

    const handleAction = lookup(ACTION_HANDLERS, action)
    if (!handleAction) throw new UserFacingError('This correction is not available.')
    if (!lookup(TONE_LABEL, tone)) throw new UserFacingError('This tone is not available.')

    const canUseLocalLanguageTool = await isLocalLanguageToolAllowed()
    const languageTool = chooseLanguageTool(isOnlineGrammarEnabled, canUseLocalLanguageTool)
    const { suggestions, reports, toneAlternatives } = await handleAction(text, { tone, languageTool, canUseLocalLanguageTool, signal })
    const finalSuggestions = dropRedundantPunctuation(removeOverlaps(validateSuggestions(text, suggestions), rankSuggestion)).map(
      (suggestion, index) => ({ ...suggestion, id: `${suggestion.engine}-${index}` }),
    )

    return {
      action,
      tone,
      original: text,
      corrected: applyDefaultSuggestions(text, finalSuggestions),
      suggestions: finalSuggestions,
      engines: reports,
      toneAlternatives,
    }
  }
  return runPipeline as CorrectionPipeline
}
