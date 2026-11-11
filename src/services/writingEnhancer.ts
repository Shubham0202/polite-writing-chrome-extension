import { AI_PROVIDER_LABEL, API_KEY_SLOTS, type AiSettings, type ApiKeySlot, type RewriteStyle } from '../constants/ai.ts'
import { ENGINE_STATUS, REWRITE_ACTION, type EngineStatus } from '../constants/corrections.ts'
import { AiLimitError, requestAiRewrite, type AiRewriteRequest } from '../engines/rewrite/aiProviders.ts'
import { buildRewritePrompt, isLeakedExample, parseRewriteResponse } from '../engines/rewrite/rewritePrompt.ts'
import {
  alignRewriteBySentence,
  createWholeTextSuggestion,
  findAddedProtectedSpans,
  findChangedNumbers,
  findMissingProtectedSpans,
  isUnchangedRewrite,
  matchQuoteStyle,
} from '../engines/rewrite/rewriteSuggestions.ts'
import { applyDefaultSuggestions, type IdentifiedSuggestion, type Suggestion } from '../engines/suggestion.ts'
import { UserFacingError } from '../utils/errors.ts'
import { getTextValidationError } from '../utils/textValidation.ts'
import { isAiConfigured, orderApiKeys, resolveModel } from './aiSettings.ts'
import { validateSuggestions } from './resultValidator.ts'

export interface WritingEnhancerOptions {
  getAiSettings: () => Promise<AiSettings>
  // Which key to try first, remembered once one reaches its limit.
  getActiveKeySlot: () => Promise<ApiKeySlot>
  setActiveKeySlot: (slot: ApiKeySlot) => Promise<void>
  requestRewrite?: (request: AiRewriteRequest) => Promise<unknown>
}

interface KeyFailoverRequest {
  settings: AiSettings
  activeKeySlot: ApiKeySlot
  request: Omit<AiRewriteRequest, 'apiKey'>
  requestRewrite: NonNullable<WritingEnhancerOptions['requestRewrite']>
  setActiveKeySlot: WritingEnhancerOptions['setActiveKeySlot']
}

interface KeyedReply {
  reply: unknown
  slot: ApiKeySlot
}

export interface RewriteRequest {
  text: string
  style: RewriteStyle
  signal?: AbortSignal
}

export interface RewriteEngineReport {
  label: string
  status: EngineStatus
  message: string | null
}

export interface RewriteResult {
  action: typeof REWRITE_ACTION
  style: RewriteStyle
  original: string
  corrected: string
  suggestions: IdentifiedSuggestion[]
  engines: RewriteEngineReport[]
}

export type WritingEnhancer = (request?: RewriteRequest) => Promise<RewriteResult>

interface RewriteResultParts {
  text: string
  style: RewriteStyle
  suggestions: IdentifiedSuggestion[]
  label: string
  message?: string | null
}

const NOT_CONFIGURED_MESSAGE = 'Add an API key in Settings to rewrite with AI.'
const UNCHANGED_MESSAGE = 'The AI found nothing to improve, so your text was left as it is.'
const toChangedSpanMessage = (span: string): string => `The rewrite changed or dropped "${span}" from your text, so it was not used. Try again.`
const toAddedSpanMessage = (span: string): string => `The rewrite added "${span}", which was not in your text, so it was not used. Try again.`
const toNumbersNotice = (numbers: string[]): string => `The rewrite changed or dropped these numbers: ${numbers.map((number: string) => `"${number}"`).join(', ')}. Check them before using it.`
const UNSAFE_REWRITE_MESSAGE = "The rewrite did not pass WriteBetter's safety checks (it grew too much or repeated itself), so it was not used. Try again."
const UNRELATED_MESSAGE = 'The AI answered with an unrelated text, so it was not used. Try again.'
const SETTINGS_UNREADABLE_MESSAGE = 'Could not read the AI settings. Reload the extension and try again.'
const API_KEY_SLOT_LABEL: Record<ApiKeySlot, string> = {
  [API_KEY_SLOTS.primary]: 'API key',
  [API_KEY_SLOTS.backup]: 'backup API key',
}
// The popup lists this label under the result, so a rewrite answered by the backup key says so.
const ENGINE_LABEL: Record<ApiKeySlot, (providerLabel: string) => string> = {
  [API_KEY_SLOTS.primary]: (providerLabel) => `AI rewrite (${providerLabel})`,
  [API_KEY_SLOTS.backup]: (providerLabel) => `AI rewrite (${providerLabel}, backup key)`,
}
// Says which key the error is about, since Settings has two and the provider's message names neither.
const toSwitchedKeyMessage = (from: ApiKeySlot, to: ApiKeySlot, message: string): string =>
  `The ${API_KEY_SLOT_LABEL[from]} reached its limit, so the ${API_KEY_SLOT_LABEL[to]} was tried. ${message}`

// Storage can fail during an update or when the profile is in trouble; the user gets a plain reason instead.
const readSettings = async (getAiSettings: WritingEnhancerOptions['getAiSettings']): Promise<AiSettings> => {
  try {
    return await getAiSettings()
  } catch {
    throw new UserFacingError(SETTINGS_UNREADABLE_MESSAGE)
  }
}

// Which key goes first is only a preference: when it cannot be read or written, a rewrite starts with the first key or
// the other key, and still runs.
const readActiveKeySlot = async (getActiveKeySlot: WritingEnhancerOptions['getActiveKeySlot']): Promise<ApiKeySlot> => {
  try {
    return await getActiveKeySlot()
  } catch {
    return API_KEY_SLOTS.primary
  }
}

const rememberActiveKey = (slot: ApiKeySlot, setActiveKeySlot: WritingEnhancerOptions['setActiveKeySlot']): Promise<void> => setActiveKeySlot(slot).catch(() => {})

// The active key is asked first. When it reaches its limit the other key is asked at once, and it becomes the active
// key only once it answers: later rewrites stay on it until it reaches its own limit. Remembering a key before it has
// answered, or keeping a backup key that fails in any other way, would leave rewrites stuck on a broken backup key
// long after the first key's limit is over.
const requestWithKeyFailover = async ({ settings, activeKeySlot, request, requestRewrite, setActiveKeySlot }: KeyFailoverRequest): Promise<KeyedReply> => {
  const [active, other] = orderApiKeys(settings, activeKeySlot)
  try {
    return { reply: await requestRewrite({ ...request, apiKey: active.apiKey }), slot: active.slot }
  } catch (error) {
    if (!(error instanceof AiLimitError) || !other) {
      if (active.slot === API_KEY_SLOTS.backup) await rememberActiveKey(API_KEY_SLOTS.primary, setActiveKeySlot)
      throw error
    }
  }

  try {
    const reply = await requestRewrite({ ...request, apiKey: other.apiKey })
    await rememberActiveKey(other.slot, setActiveKeySlot)
    return { reply, slot: other.slot }
  } catch (error) {
    throw error instanceof UserFacingError ? new UserFacingError(toSwitchedKeyMessage(active.slot, other.slot, error.message)) : error
  }
}

const withIds = (suggestions: Suggestion[]): IdentifiedSuggestion[] => suggestions.map((suggestion, index) => ({ ...suggestion, id: `${suggestion.engine}-${index}` }))

// Same shape as a correction result, so the popup reviews an AI rewrite with the controls it already has.
const toResult = ({ text, style, suggestions, label, message = null }: RewriteResultParts): RewriteResult => ({
  action: REWRITE_ACTION,
  style,
  original: text,
  corrected: applyDefaultSuggestions(text, suggestions),
  suggestions,
  engines: [{ label, status: ENGINE_STATUS.used, message }],
})

// The validator decides per suggestion, so a per-sentence set is only kept when it survives whole; otherwise the whole
// text becomes one suggestion. Either way, accepting everything gives back exactly what the model wrote.
const chooseSuggestions = (text: string, perSentence: Suggestion[] | null, wholeText: Suggestion): Suggestion[] => {
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
export const createWritingEnhancer = ({ getAiSettings, getActiveKeySlot, setActiveKeySlot, requestRewrite = requestAiRewrite }: WritingEnhancerOptions): WritingEnhancer =>
  async ({ text, style, signal }: RewriteRequest = {} as RewriteRequest): Promise<RewriteResult> => {
    const inputError = getTextValidationError(text)
    if (inputError) throw new UserFacingError(inputError)
    const prompt = buildRewritePrompt({ text, style })

    const settings = await readSettings(getAiSettings)
    if (!isAiConfigured(settings)) throw new UserFacingError(NOT_CONFIGURED_MESSAGE)
    const request = { provider: settings.provider, model: resolveModel(settings), prompt, signal }
    const activeKeySlot = await readActiveKeySlot(getActiveKeySlot)
    const { reply, slot } = await requestWithKeyFailover({ settings, activeKeySlot, request, requestRewrite, setActiveKeySlot })
    const label = ENGINE_LABEL[slot](AI_PROVIDER_LABEL[settings.provider])
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
