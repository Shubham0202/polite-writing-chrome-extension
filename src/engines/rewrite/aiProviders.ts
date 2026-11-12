/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { AI_PROVIDERS, AI_PROVIDER_LABEL, AI_PROVIDER_ORIGIN, type AiProvider } from '../../constants/ai.ts'
import { UserFacingError } from '../../utils/errors.ts'
import { lookup } from '../../utils/lookup.ts'

// Reasoning models can take a while; LanguageTool's 6 seconds would cut them off. The pending popup reply keeps the
// service worker alive for far longer than this, so the timeout always fires first.
const REQUEST_TIMEOUT_MS = 30_000
// An overloaded provider usually recovers within seconds (Gemini's own 503 message says the spike is temporary), so the
// request is sent again before the user hears about it: two more tries, a little later each time. Tests shorten them.
const RETRY_DELAYS_MS = [1_000, 3_000]
const OVERLOADED_STATUS = 503
const RATE_LIMIT_STATUS = 429
const NO_CREDIT_STATUS = 402
// Answers about the key's account rather than the request, so another key may well get through.
const KEY_LIMIT_STATUSES: readonly number[] = [RATE_LIMIT_STATUS, NO_CREDIT_STATUS]
const MAX_DETAIL_LENGTH = 160
const JSON_HEADERS = { 'Content-Type': 'application/json' }
const CANCELLED_MESSAGE = 'The rewrite was cancelled.'
const CUT_OFF_MESSAGE = 'The rewrite was cut off before it finished. Try a shorter text.'
const DECLINED_MESSAGE = 'The AI provider declined to rewrite this text.'
const BROKEN_REPLY_MESSAGE = 'The AI provider returned a broken reply. Try again.'
const KEY_MESSAGE = 'The AI provider rejected the API key. Check it in Settings.'
const WEBSITE_KEY_MESSAGE = 'This API key only works from websites. Create a key without website restrictions and save it in Settings.'
const DATA_POLICY_MESSAGE = 'No OpenRouter provider can serve this model under your account settings. Choose another model, or change the data policy on openrouter.ai.'
const OVERLOADED_MESSAGE = 'The AI provider is overloaded right now. Try again in a minute, or choose another model or provider in Settings.'

// The key reached its rate limit or quota, or ran out of credit. Its own type, so a caller with a second key knows it
// may switch to it.
export class AiLimitError extends UserFacingError {
  constructor(message: string) {
    super(message)
    this.name = 'AiLimitError'
  }
}

export interface AiPrompt {
  system: string
  user: string
}

export interface AiRewriteRequest {
  provider: AiProvider
  apiKey: string
  model: string
  prompt: AiPrompt
  signal?: AbortSignal
  retryDelaysMs?: readonly number[]
}

type AiRewriteInput = Pick<AiRewriteRequest, 'apiKey' | 'model' | 'prompt'>

interface ProviderRequest {
  url: string
  headers: Record<string, string>
  body: object
}

// Every field is optional: the body comes from a remote service and is read defensively. Gemini fills `promptFeedback`
// and `candidates`; Groq and OpenRouter fill `choices`; all of them may report `error`.
interface ProviderErrorDetail {
  message?: unknown
  code?: unknown
}

interface ProviderResponseBody {
  error?: ProviderErrorDetail
  promptFeedback?: { blockReason?: unknown }
  candidates?: Array<{
    content?: { parts?: Array<{ thought?: unknown; text?: unknown }> }
    finishReason?: unknown
  }>
  choices?: Array<{
    message?: { content?: string | Array<{ text?: unknown }> | null; refusal?: unknown }
    error?: ProviderErrorDetail
    finish_reason?: unknown
  }>
}

interface ProviderDefinition {
  buildRequest: (request: AiRewriteInput) => ProviderRequest
  readText: (body: ProviderResponseBody | null) => string | undefined
}

interface HttpErrorContext {
  provider: AiProvider
  providerLabel: string
  model: string
}

interface FetchedJson {
  response: Response
  body: ProviderResponseBody | null
}

const HTTP_ERROR_MESSAGE: Record<number, string> = {
  401: KEY_MESSAGE,
  [NO_CREDIT_STATUS]: 'Your account with the AI provider has no credit for this model. Add credit, or enter a model your account can use in Settings.',
  403: 'The AI provider refused the API key. Check it in Settings.',
  [RATE_LIMIT_STATUS]: "The AI provider's rate limit or quota was reached. Try again later.",
  [OVERLOADED_STATUS]: OVERLOADED_MESSAGE,
}

// OpenRouter answers a bad key with 401 and keeps 403 for moderation flags, guardrails and spending limits.
const PROVIDER_HTTP_ERROR_MESSAGE: Partial<Record<AiProvider, Record<number, string>>> = {
  [AI_PROVIDERS.openRouter]: { 403: 'OpenRouter refused this request because of a moderation flag, a guardrail or a spending limit.' },
}

// Gemini answers a bad key with HTTP 400, OpenRouter a bad model id; only the body says which. Groq checks its own
// JSON-mode output and reports a failure with this code.
const KEY_DETAIL_PATTERN = /api[ _-]?key|unauthenticated|invalid.*(?:token|credential)/i
const MODEL_DETAIL_PATTERN = /\bmodel\b/i
const REFERRER_DETAIL_PATTERN = /referr?er/i
const DATA_POLICY_DETAIL_PATTERN = /data policy|endpoints found matching/i
const JSON_FAILURE_CODE = 'json_validate_failed'

// Gemini and OpenAI-style finish reasons that mean the reply is not a usable rewrite, even when it has text.
const FINISH_REASON_MESSAGE: Record<string, string> = {
  MAX_TOKENS: CUT_OFF_MESSAGE,
  CONTINUATION: CUT_OFF_MESSAGE,
  length: CUT_OFF_MESSAGE,
  SAFETY: DECLINED_MESSAGE,
  RECITATION: DECLINED_MESSAGE,
  PROHIBITED_CONTENT: DECLINED_MESSAGE,
  BLOCKLIST: DECLINED_MESSAGE,
  SPII: DECLINED_MESSAGE,
  OTHER: DECLINED_MESSAGE,
  LANGUAGE: DECLINED_MESSAGE,
  ESCALATION: DECLINED_MESSAGE,
  PUP_LIMITED_DISABLED: DECLINED_MESSAGE,
  MALFORMED_RESPONSE: BROKEN_REPLY_MESSAGE,
  MALFORMED_FUNCTION_CALL: BROKEN_REPLY_MESSAGE,
  content_filter: DECLINED_MESSAGE,
}

// Thinking models can return their reasoning as parts flagged `thought`; only the answer parts are the reply.
const readGeminiText = (body: ProviderResponseBody | null): string | undefined =>
  body?.candidates?.[0]?.content?.parts
    ?.filter((part) => !part?.thought && typeof part?.text === 'string')
    .map((part) => part.text)
    .join('')

const readChatCompletionText = (body: ProviderResponseBody | null): string | undefined => {
  const content = body?.choices?.[0]?.message?.content
  if (Array.isArray(content)) return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
  return typeof content === 'string' ? content : undefined
}

interface ChatCompletionSampling {
  temperature?: number
}

// Groq and OpenRouter both speak the OpenAI chat-completions dialect. JSON mode needs the word JSON in the prompt,
// which the rewrite prompt provides. Sampling parameters are opt-in per provider: reasoning models reject any
// temperature but their own default, so a provider that would pass one straight through gets none.
const buildChatCompletionRequest = (
  url: string,
  headers: Record<string, string>,
  { apiKey, model, prompt }: AiRewriteInput,
  sampling: ChatCompletionSampling = {},
): ProviderRequest => ({
  url,
  headers: { ...JSON_HEADERS, Authorization: `Bearer ${apiKey}`, ...headers },
  body: {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: { type: 'json_object' },
    ...sampling,
  },
})

const PROVIDERS: Record<AiProvider, ProviderDefinition> = {
  [AI_PROVIDERS.gemini]: {
    buildRequest: ({ apiKey, model, prompt }: AiRewriteInput): ProviderRequest => ({
      // Users sometimes paste the "models/…" form from the model list; the URL already has that prefix.
      url: `${AI_PROVIDER_ORIGIN[AI_PROVIDERS.gemini]}/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`,
      headers: { ...JSON_HEADERS, 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: { type: 'object', properties: { rewritten: { type: 'string' } }, required: ['rewritten'] },
        },
      },
    }),
    readText: readGeminiText,
  },
  [AI_PROVIDERS.groq]: {
    buildRequest: (request: AiRewriteInput): ProviderRequest => buildChatCompletionRequest(`${AI_PROVIDER_ORIGIN[AI_PROVIDERS.groq]}/openai/v1/chat/completions`, {}, request),
    readText: readChatCompletionText,
  },
  // A low temperature keeps the rewrite close to the text. OpenRouter's providers ignore a parameter they do not
  // support (require_parameters is off by default), so no model there is refused because of it.
  [AI_PROVIDERS.openRouter]: {
    buildRequest: (request: AiRewriteInput): ProviderRequest =>
      buildChatCompletionRequest(`${AI_PROVIDER_ORIGIN[AI_PROVIDERS.openRouter]}/api/v1/chat/completions`, { 'X-Title': 'WriteBetter' }, request, { temperature: 0.2 }),
    readText: readChatCompletionText,
  },
}

const truncate = (text: string): string => (text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH - 1)}…` : text)

// Both dialects report problems as { error: { message } }, in error responses and sometimes inside a 200 reply;
// OpenAI-style models may also decline in message.refusal.
const readProviderDetail = (body: ProviderResponseBody | null): string => {
  const detail = body?.error?.message ?? body?.choices?.[0]?.error?.message ?? body?.choices?.[0]?.message?.refusal
  return typeof detail === 'string' && detail.trim() ? truncate(detail.trim()) : ''
}

const withDetail = (message: string, detail: string, providerLabel: string): string => (detail ? `${message} ${providerLabel} said: ${detail}` : message)

const describeModelError = ({ providerLabel, model }: Pick<HttpErrorContext, 'providerLabel' | 'model'>): string => `${providerLabel} does not know the model "${model}". Enter a current model name in Settings.`

// The body is more precise than the status for a handful of well-known answers; it is read before the status map.
const describeKnownBody = (status: number, body: ProviderResponseBody | null, detail: string, context: HttpErrorContext): string | null => {
  if (body?.error?.code === JSON_FAILURE_CODE) return `${context.providerLabel} could not produce a valid rewrite this time. Try again.`
  if (status === 403 && REFERRER_DETAIL_PATTERN.test(detail)) return WEBSITE_KEY_MESSAGE
  if (status === 404 && DATA_POLICY_DETAIL_PATTERN.test(detail)) return DATA_POLICY_MESSAGE
  if (status === 404) return describeModelError(context)
  if (status === 400 && KEY_DETAIL_PATTERN.test(detail)) return KEY_MESSAGE
  if (status === 400 && MODEL_DETAIL_PATTERN.test(detail)) return describeModelError(context)
  return null
}

const describeHttpError = (status: number, body: ProviderResponseBody | null, context: HttpErrorContext): string => {
  const detail = readProviderDetail(body)
  const message =
    describeKnownBody(status, body, detail, context) ??
    lookup(PROVIDER_HTTP_ERROR_MESSAGE[context.provider] ?? {}, status) ??
    lookup(HTTP_ERROR_MESSAGE, status) ??
    `${context.providerLabel} returned an error (HTTP ${status}).`
  return withDetail(message, detail, context.providerLabel)
}

const readFinishReason = (body: ProviderResponseBody | null): unknown =>
  [body?.promptFeedback?.blockReason, body?.candidates?.[0]?.finishReason, body?.choices?.[0]?.finish_reason].find((value) => typeof value === 'string')

const describeInterruption = ({ signal, timeoutSignal, providerLabel }: { signal?: AbortSignal; timeoutSignal: AbortSignal; providerLabel: string }): string | null => {
  if (signal?.aborted) return CANCELLED_MESSAGE
  if (timeoutSignal.aborted) return `${providerLabel} did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Try again, or choose a faster model in Settings.`
  return null
}

// Sends the request and reads the JSON body. A cancellation or the timeout can also strike while the body is still
// arriving, which is reported as such rather than as an empty reply.
const fetchJson = async ({ url, headers, body }: ProviderRequest, { signal, providerLabel }: { signal?: AbortSignal; providerLabel: string }): Promise<FetchedJson> => {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const interruption = () => describeInterruption({ signal, timeoutSignal, providerLabel })

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.any([timeoutSignal, ...(signal ? [signal] : [])]),
    })
  } catch {
    throw new UserFacingError(
      interruption() ?? `Could not reach ${providerLabel}. Check your internet connection, or whether a proxy or policy blocks it. ${providerLabel} itself may also be down right now.`,
    )
  }

  try {
    return { response, body: await response.json() }
  } catch {
    const reason = interruption()
    if (reason) throw new UserFacingError(reason)
    return { response, body: null }
  }
}

// Sleeps between two attempts. A cancellation ends the wait at once, so no further attempt is made.
const waitUnlessCancelled = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new UserFacingError(CANCELLED_MESSAGE))
    const cancel = () => {
      clearTimeout(timer)
      reject(new UserFacingError(CANCELLED_MESSAGE))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', cancel, { once: true })
  })

// Sends the request, and sends it again after each delay while the provider answers that it is overloaded.
const fetchWithRetries = async (
  request: ProviderRequest,
  { signal, providerLabel, retryDelaysMs }: { signal?: AbortSignal; providerLabel: string; retryDelaysMs: readonly number[] },
): Promise<FetchedJson> => {
  for (const delayMs of retryDelaysMs) {
    const attempt = await fetchJson(request, { signal, providerLabel })
    if (attempt.response.status !== OVERLOADED_STATUS) return attempt
    await waitUnlessCancelled(delayMs, signal)
  }
  return fetchJson(request, { signal, providerLabel })
}

// The one entry point to every AI provider: sends a system + user prompt, returns the model's reply as text.
export const requestAiRewrite = async ({ provider, apiKey, model, prompt, signal, retryDelaysMs = RETRY_DELAYS_MS }: AiRewriteRequest): Promise<string> => {
  const definition = lookup(PROVIDERS, provider)
  if (!definition) throw new UserFacingError('This AI provider is not available.')
  const providerLabel = AI_PROVIDER_LABEL[provider]

  const { response, body } = await fetchWithRetries(definition.buildRequest({ apiKey, model, prompt }), { signal, providerLabel, retryDelaysMs })
  if (!response.ok) {
    const message = describeHttpError(response.status, body, { provider, providerLabel, model })
    throw KEY_LIMIT_STATUSES.includes(response.status) ? new AiLimitError(message) : new UserFacingError(message)
  }

  const detail = readProviderDetail(body)
  const finishMessage = lookup(FINISH_REASON_MESSAGE, readFinishReason(body))
  if (finishMessage) throw new UserFacingError(withDetail(finishMessage, detail, providerLabel))
  if (typeof body?.choices?.[0]?.message?.refusal === 'string') throw new UserFacingError(withDetail(DECLINED_MESSAGE, detail, providerLabel))

  const text = definition.readText(body)
  if (typeof text !== 'string' || !text.trim()) throw new UserFacingError(withDetail(`${providerLabel} returned no rewrite. Try again.`, detail, providerLabel))
  return text
}
