/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { CORRECTION_ACTIONS, ENGINES, ENGINE_STATUS, SOURCES, TONES, TONE_LABEL } from '../constants/corrections.js'
import { DEFAULT_SETTINGS } from '../constants/settings.js'
import { checkWithLanguageTool } from '../engines/grammar/languageTool.js'
import { checkGrammarRules } from '../engines/grammar/grammarRules.js'
import { applyDefaultSuggestions, isAcceptedByDefault } from '../engines/suggestion.js'
import { checkTense } from '../engines/tense/tenseEngine.js'
import { checkTone, containsApology, createToneSuggestion, rewriteSentences } from '../engines/tone/toneEngine.js'
import { applyEdits, removeOverlaps } from '../utils/diffUtils.js'
import { UserFacingError } from '../utils/errors.js'
import { lookup } from '../utils/lookup.js'
import { getTextValidationError } from '../utils/textValidation.js'
import { splitSentences } from '../utils/textUtils.js'
import { dropRedundantPunctuation, validateSuggestions } from './resultValidator.js'

// Targeted local rules win over LanguageTool where both touch the same words: they are written to keep meaning
// ("they was" → "they were", where LanguageTool's first suggestion is "they are").
// Checks on websites run after every pause in typing, so a LanguageTool server that failed is left alone for this long.
const INLINE_LANGUAGE_TOOL_RETRY_MS = 60_000

const TONE_SETTING = {
  [TONES.polite]: 'isPoliteEnabled',
  [TONES.professional]: 'isProfessionalEnabled',
}

const SOURCE_PRIORITY = {
  [SOURCES.localRule]: 1,
  [SOURCES.languageTool]: 2,
  [SOURCES.dictionary]: 3,
}

const rankSuggestion = (suggestion) => (suggestion.engine === ENGINES.tone ? 0 : SOURCE_PRIORITY[suggestion.source])

// `check` returns a list of suggestions, or { suggestions, message } when the engine ran with a caveat.
const runEngine = async (label, check, { failureStatus = ENGINE_STATUS.failed, fallbackMessage = '' } = {}) => {
  try {
    const output = await check()
    const { suggestions, message = null } = Array.isArray(output) ? { suggestions: output } : output
    return { suggestions, report: { label, status: ENGINE_STATUS.used, message } }
  } catch (error) {
    if (!(error instanceof UserFacingError)) console.error(`[WriteBetter] ${label} failed`, error)
    const reason = error instanceof UserFacingError ? error.message : `${label} could not run.`
    return { suggestions: [], report: { label, status: failureStatus, message: `${reason} ${fallbackMessage}`.trim() } }
  }
}

const isInside = (suggestion, sentence) => {
  const sentenceEnd = sentence.offset + sentence.text.length
  // A space inserted right after a sentence separates it from the next one, so it is not part of the rewrite.
  const isSpaceAfterSentence = suggestion.length === 0 && suggestion.offset === sentenceEnd && !suggestion.replacements[0]?.trim()
  return !isSpaceAfterSentence && suggestion.offset >= sentence.offset && suggestion.offset + suggestion.length <= sentenceEnd
}

// Two lowercase "i"s produce the same explanation twice; list each kind of fix once.
const describeCorrections = (corrections) => [
  ...new Map(corrections.map(({ category, explanation }) => [explanation, { category, explanation }])).values(),
]

// For "Fix Everything": each sentence is corrected first, then rewritten in the requested tone. A rewritten
// sentence becomes one suggestion that includes the corrections inside it, so nothing is applied twice.
const mergeToneIntoCorrections = (text, corrections, tone) => {
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
}) => {
  const localLanguageTool = {
    label: 'Grammar (LanguageTool)',
    check: (text) => checkWithLanguageTool(text, languageToolOptions),
  }
  const onlineLanguageTool = {
    label: 'Grammar (LanguageTool online)',
    check: (text) => checkWithLanguageTool(text, onlineLanguageToolOptions),
  }
  let inlineLanguageToolRetryAt = 0

  const createInlineLanguageTool = (signal) => ({
    label: localLanguageTool.label,
    check: async (text) => {
      if (Date.now() < inlineLanguageToolRetryAt) throw new UserFacingError('LanguageTool failed recently, so it was skipped for now.')
      try {
        return await checkWithLanguageTool(text, { ...languageToolOptions, signal })
      } catch (error) {
        if (!signal?.aborted) inlineLanguageToolRetryAt = Date.now() + INLINE_LANGUAGE_TOOL_RETRY_MS
        throw error
      }
    },
  })

  const runSpelling = (text) =>
    runEngine('Spelling (nspell)', async () => {
      const { suggestions, isComplete } = getSpellChecker()(text, { ignoredWords: await getIgnoredWords() })
      return { suggestions, message: isComplete ? null : 'Only the first part was spell-checked because the text has many unknown words.' }
    })

  const runGrammar = (text, languageTool) => [
    runEngine(languageTool.label, () => languageTool.check(text), {
      failureStatus: ENGINE_STATUS.unavailable,
      fallbackMessage: 'Grammar was checked with local rules only.',
    }),
    runEngine('Grammar (local rules)', () => checkGrammarRules(text)),
    runEngine('Tense rules', () => checkTense(text)),
  ]

  // The switches are for checks that run by themselves; a popup button is an explicit request, so it always runs everything.
  const runCorrections = async (text, languageTool, { isSpellingEnabled, isGrammarEnabled } = DEFAULT_SETTINGS) => {
    const results = await Promise.all([
      ...(isSpellingEnabled ? [runSpelling(text)] : []),
      ...(isGrammarEnabled ? runGrammar(text, languageTool) : []),
    ])
    return {
      suggestions: results.flatMap((result) => result.suggestions),
      reports: results.map((result) => result.report),
    }
  }

  const runValidatedCorrections = async (text, languageTool, settings) => {
    const { suggestions, reports } = await runCorrections(text, languageTool, settings)
    return { suggestions: removeOverlaps(validateSuggestions(text, suggestions), rankSuggestion), reports }
  }

  const runTone = async (text, tone) => {
    const { suggestions, report } = await runEngine(`${TONE_LABEL[tone]} tone rules`, () => checkTone(text, tone))
    return { suggestions, reports: [report] }
  }

  const runFixEverything = async (text, tone, languageTool) => {
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
  const runToneAlternatives = async (text, corrections, tone) => {
    const { suggestions, report } = await runEngine(`${TONE_LABEL[tone]} tone rules`, () =>
      validateSuggestions(text, mergeToneIntoCorrections(text, corrections, tone)).filter(({ engine }) => engine === ENGINES.tone),
    )
    return { tone, suggestions: suggestions.map((suggestion, index) => ({ ...suggestion, id: `${tone}-${index}` })), report }
  }

  const runInlineCheck = async (text, signal) => {
    const settings = await getSettings()
    const corrections = await runValidatedCorrections(text, createInlineLanguageTool(signal), settings)
    const enabledTones = Object.values(TONES).filter((tone) => settings[TONE_SETTING[tone]])
    const alternatives = await Promise.all(enabledTones.map((tone) => runToneAlternatives(text, corrections.suggestions, tone)))
    const noRewrites = Object.fromEntries(Object.values(TONES).map((tone) => [tone, []]))
    return {
      suggestions: corrections.suggestions,
      reports: [...corrections.reports, ...alternatives.map(({ report }) => report)],
      toneAlternatives: { ...noRewrites, ...Object.fromEntries(alternatives.map(({ tone, suggestions }) => [tone, suggestions])) },
    }
  }

  const ACTION_HANDLERS = {
    [CORRECTION_ACTIONS.fixGrammar]: (text, { languageTool }) => runCorrections(text, languageTool),
    [CORRECTION_ACTIONS.makePolite]: (text) => runTone(text, TONES.polite),
    [CORRECTION_ACTIONS.professional]: (text) => runTone(text, TONES.professional),
    [CORRECTION_ACTIONS.fixEverything]: (text, { tone, languageTool }) => runFixEverything(text, tone, languageTool),
    // Inline checks run without the user asking, so they never use the online service, whatever the popup switch says.
    [CORRECTION_ACTIONS.inlineCheck]: (text, { signal }) => runInlineCheck(text, signal),
  }

  return async ({ text, action, tone = TONES.polite, isOnlineGrammarEnabled = false, signal } = {}) => {
    const inputError = getTextValidationError(text)
    if (inputError) throw new UserFacingError(inputError)

    const handleAction = lookup(ACTION_HANDLERS, action)
    if (!handleAction) throw new UserFacingError('This correction is not available.')
    if (!lookup(TONE_LABEL, tone)) throw new UserFacingError('This tone is not available.')

    const languageTool = isOnlineGrammarEnabled ? onlineLanguageTool : localLanguageTool
    const { suggestions, reports, toneAlternatives } = await handleAction(text, { tone, languageTool, signal })
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
}
