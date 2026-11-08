import { AI_PROVIDER_LABEL } from '../constants/ai.js'
import { ENGINE_STATUS, REWRITE_ACTION } from '../constants/corrections.js'
import { requestAiRewrite } from '../engines/rewrite/aiProviders.js'
import { buildRewritePrompt, isLeakedExample, parseRewriteResponse } from '../engines/rewrite/rewritePrompt.js'
import {
  alignRewriteBySentence,
  createWholeTextSuggestion,
  findAddedProtectedSpans,
  findChangedNumbers,
  findMissingProtectedSpans,
  isUnchangedRewrite,
  matchQuoteStyle,
} from '../engines/rewrite/rewriteSuggestions.js'
import { applyDefaultSuggestions } from '../engines/suggestion.js'
import { UserFacingError } from '../utils/errors.js'
import { getTextValidationError } from '../utils/textValidation.js'
import { isAiConfigured, resolveModel } from './aiSettings.js'
import { validateSuggestions } from './resultValidator.js'

const NOT_CONFIGURED_MESSAGE = 'Add an API key in Settings to rewrite with AI.'
const UNCHANGED_MESSAGE = 'The AI found nothing to improve, so your text was left as it is.'
const toChangedSpanMessage = (span) => `The rewrite changed or dropped "${span}" from your text, so it was not used. Try again.`
const toAddedSpanMessage = (span) => `The rewrite added "${span}", which was not in your text, so it was not used. Try again.`
const toNumbersNotice = (numbers) => `The rewrite changed or dropped these numbers: ${numbers.map((number) => `"${number}"`).join(', ')}. Check them before using it.`
const UNSAFE_REWRITE_MESSAGE = "The rewrite did not pass WriteBetter's safety checks (it grew too much or repeated itself), so it was not used. Try again."
const UNRELATED_MESSAGE = 'The AI answered with an unrelated text, so it was not used. Try again.'
const SETTINGS_UNREADABLE_MESSAGE = 'Could not read the AI settings. Reload the extension and try again.'

// Storage can fail during an update or when the profile is in trouble; the user gets a reason, the console the cause.
const readSettings = async (getAiSettings) => {
  try {
    return await getAiSettings()
  } catch (error) {
    console.error('[WriteBetter] Could not read the AI settings', error)
    throw new UserFacingError(SETTINGS_UNREADABLE_MESSAGE)
  }
}

const withIds = (suggestions) => suggestions.map((suggestion, index) => ({ ...suggestion, id: `${suggestion.engine}-${index}` }))

// Same shape as a correction result, so the popup reviews an AI rewrite with the controls it already has.
const toResult = ({ text, style, suggestions, label, message = null }) => ({
  action: REWRITE_ACTION,
  style,
  original: text,
  corrected: applyDefaultSuggestions(text, suggestions),
  suggestions,
  engines: [{ label, status: ENGINE_STATUS.used, message }],
})

// The validator decides per suggestion, so a per-sentence set is only kept when it survives whole; otherwise the whole
// text becomes one suggestion. Either way, accepting everything gives back exactly what the model wrote.
const chooseSuggestions = (text, perSentence, wholeText) => {
  if (perSentence?.length) {
    const kept = validateSuggestions(text, perSentence)
    if (kept.length === perSentence.length) return kept
  }
  const kept = validateSuggestions(text, [wholeText])
  if (!kept.length) throw new UserFacingError(UNSAFE_REWRITE_MESSAGE)
  return kept
}

// The writing enhancer: one explicit, user-triggered AI rewrite of the whole text. It is separate from the correction
// pipeline on purpose, so the local engines keep their "fix the error, keep the wording" behaviour.
export const createWritingEnhancer = ({ getAiSettings, requestRewrite = requestAiRewrite }) =>
  async ({ text, style, signal } = {}) => {
    const inputError = getTextValidationError(text)
    if (inputError) throw new UserFacingError(inputError)
    const prompt = buildRewritePrompt({ text, style })

    const settings = await readSettings(getAiSettings)
    if (!isAiConfigured(settings)) throw new UserFacingError(NOT_CONFIGURED_MESSAGE)
    const label = `AI rewrite (${AI_PROVIDER_LABEL[settings.provider]})`

    const reply = await requestRewrite({ provider: settings.provider, apiKey: settings.apiKey, model: resolveModel(settings), prompt, signal })
    const rewritten = matchQuoteStyle(text, parseRewriteResponse(reply))
    if (isLeakedExample(text, rewritten)) throw new UserFacingError(UNRELATED_MESSAGE)

    const wholeText = createWholeTextSuggestion(text, rewritten, style)
    if (isUnchangedRewrite(text, rewritten) || !wholeText.replacements.length) {
      return toResult({ text, style, suggestions: [], label, message: UNCHANGED_MESSAGE })
    }
    // Checked on the whole reply first, so the user gets the specific reason rather than a generic rejection.
    const [added] = findAddedProtectedSpans(text, rewritten)
    if (added) throw new UserFacingError(toAddedSpanMessage(added))
    const [missing] = findMissingProtectedSpans(text, rewritten)
    if (missing) throw new UserFacingError(toChangedSpanMessage(missing))

    const suggestions = withIds(chooseSuggestions(text, alignRewriteBySentence(text, rewritten, style), wholeText))
    // Numbers are shown, not blocked: the user sees both versions and decides.
    const changedNumbers = findChangedNumbers(text, rewritten)
    return toResult({ text, style, suggestions, label, message: changedNumbers.length ? toNumbersNotice(changedNumbers) : null })
  }
