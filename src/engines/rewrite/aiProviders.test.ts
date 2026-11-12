import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { AI_PROVIDERS, type AiProvider } from '../../constants/ai.ts'
import { UserFacingError } from '../../utils/errors.ts'
import { AiLimitError, requestAiRewrite, type AiRewriteRequest } from './aiProviders.ts'

interface MockRequestInit {
  method: string
  headers: Record<string, string>
  body: string
  signal: AbortSignal
}

// The request body as the providers send it; each test reads only the fields of its own provider.
interface RecordedBody {
  model: unknown
  messages: unknown
  response_format: unknown
  temperature: unknown
  systemInstruction: unknown
  contents: unknown
  generationConfig: { responseMimeType: unknown; responseJsonSchema: { required: unknown } }
}

interface RecordedCall {
  url: string
  init: MockRequestInit
  body: RecordedBody
}

type MockResponse = Response | ((init: MockRequestInit) => Response | Promise<Response>)

const PROMPT = { system: 'Rules. Reply with JSON only.', user: 'Style: Make polite\n<text>\nsend it\n</text>' }
const REPLY = '{"rewritten": "Could you please send it?"}'
const originalFetch = globalThis.fetch

const geminiReply = (parts: Array<{ text: string; thought?: boolean }>, finishReason = 'STOP') => ({ candidates: [{ content: { parts }, finishReason }] })
const chatReply = (content: string | Array<{ type: string; text: string }> | null, finish_reason = 'stop') => ({ choices: [{ message: { role: 'assistant', content }, finish_reason }] })

// Records the one request and answers it with the given response.
const mockFetch = (response: MockResponse): RecordedCall[] => {
  const calls: RecordedCall[] = []
  const mock = async (url: string, init: MockRequestInit): Promise<Response> => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    return typeof response === 'function' ? response(init) : response
  }
  // The code under test always passes a string URL and a full init, narrower than what `fetch` accepts.
  globalThis.fetch = mock as typeof fetch
  return calls
}

const request = (provider: AiProvider, overrides: Partial<AiRewriteRequest> = {}) => requestAiRewrite({ provider, apiKey: 'sk-test', model: 'some-model', prompt: PROMPT, ...overrides })

const assertUserFacing = (pattern: RegExp) => (error: unknown) => {
  assert.ok(error instanceof UserFacingError, `${error} is user-facing`)
  assert.match(error.message, pattern)
  return true
}

describe('AI providers', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('calls Gemini natively, with the key in a header and JSON output of the right shape requested', async () => {
    const calls = mockFetch(Response.json(geminiReply([{ text: REPLY }])))
    assert.equal(await request(AI_PROVIDERS.gemini, { model: 'models/gemini-3.8-flash' }), REPLY)

    const [{ url, init, body }] = calls
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers['x-goog-api-key'], 'sk-test')
    assert.doesNotMatch(url, /sk-test/)
    assert.deepEqual(body.systemInstruction, { parts: [{ text: PROMPT.system }] })
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: PROMPT.user }] }])
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.deepEqual(body.generationConfig.responseJsonSchema.required, ['rewritten'])
    assert.equal('temperature' in body.generationConfig, false)
  })

  it('skips Gemini thought parts and joins the answer parts', async () => {
    mockFetch(Response.json(geminiReply([{ text: 'thinking…', thought: true }, { text: '{"rewritten": ' }, { text: '"Done."}' }])))
    assert.equal(await request(AI_PROVIDERS.gemini), '{"rewritten": "Done."}')
  })

  it('calls Groq and OpenRouter as OpenAI-compatible chat completions in JSON mode, with a low temperature only on OpenRouter', async () => {
    const groqCalls = mockFetch(Response.json(chatReply(REPLY)))
    assert.equal(await request(AI_PROVIDERS.groq), REPLY)
    const [{ url: groqUrl, init: groqInit, body: groqBody }] = groqCalls
    assert.equal(groqUrl, 'https://api.groq.com/openai/v1/chat/completions')
    assert.equal(groqInit.headers.Authorization, 'Bearer sk-test')
    assert.equal(groqBody.model, 'some-model')
    assert.deepEqual(groqBody.messages, [
      { role: 'system', content: PROMPT.system },
      { role: 'user', content: PROMPT.user },
    ])
    assert.deepEqual(groqBody.response_format, { type: 'json_object' })
    assert.equal('temperature' in groqBody, false)

    const openRouterCalls = mockFetch(Response.json(chatReply([{ type: 'text', text: REPLY }])))
    assert.equal(await request(AI_PROVIDERS.openRouter), REPLY)
    const [{ url, init, body }] = openRouterCalls
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(init.headers.Authorization, 'Bearer sk-test')
    assert.equal(init.headers['X-Title'], 'WriteBetter')
    assert.equal(body.temperature, 0.2)
    assert.deepEqual(body.response_format, { type: 'json_object' })
  })

  it('explains key, model and rate-limit problems, quoting the provider', async () => {
    for (const [status, pattern] of [
      [401, /rejected the API key.*Settings.*Google Gemini said: API key not valid/],
      [403, /refused the API key/],
      [404, /does not know the model "some-model".*Settings/],
      [429, /rate limit or quota was reached/],
      [500, /Google Gemini returned an error \(HTTP 500\)/],
    ] satisfies Array<[number, RegExp]>) {
      mockFetch(Response.json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, { status }))
      await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(pattern), String(status))
    }
  })

  it('marks only a reached rate limit or quota, or a lack of credit, as a limit error, so a backup key can take over', async () => {
    for (const provider of Object.values(AI_PROVIDERS)) {
      for (const status of [429, 402]) {
        mockFetch(Response.json({ error: { message: 'Resource has been exhausted (e.g. check quota).' } }, { status }))
        await assert.rejects(request(provider), (error) => error instanceof AiLimitError, `${provider} ${status}`)
      }
    }
    for (const status of [400, 401, 403, 404, 500]) {
      mockFetch(Response.json({ error: { message: 'nope' } }, { status }))
      await assert.rejects(request(AI_PROVIDERS.openRouter), (error) => error instanceof UserFacingError && !(error instanceof AiLimitError), String(status))
    }
  })

  it('tells credit, website-restricted keys, OpenRouter moderation and data-policy answers apart', async () => {
    mockFetch(Response.json({ error: { code: 402, message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits' } }, { status: 402 }))
    await assert.rejects(request(AI_PROVIDERS.openRouter), assertUserFacing(/no credit for this model.*Settings/))

    mockFetch(Response.json({ error: { code: 403, message: 'Requests from referer <empty> are blocked.', status: 'PERMISSION_DENIED' } }, { status: 403 }))
    await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(/only works from websites/))

    mockFetch(Response.json({ error: { code: 403, message: 'Your input was flagged', metadata: { reasons: ['hate'] } } }, { status: 403 }))
    await assert.rejects(request(AI_PROVIDERS.openRouter), assertUserFacing(/moderation flag, a guardrail or a spending limit/))
    mockFetch(Response.json({ error: { message: 'forbidden' } }, { status: 403 }))
    await assert.rejects(request(AI_PROVIDERS.groq), assertUserFacing(/refused the API key/))

    mockFetch(Response.json({ error: { code: 404, message: 'No endpoints found matching your data policy (Free model publication).' } }, { status: 404 }))
    await assert.rejects(request(AI_PROVIDERS.openRouter), assertUserFacing(/data policy on openrouter.ai/))

    mockFetch(Response.json({ error: { message: 'Failed to generate JSON. Please adjust your prompt.', code: 'json_validate_failed', failed_generation: '{' } }, { status: 400 }))
    await assert.rejects(request(AI_PROVIDERS.groq), assertUserFacing(/could not produce a valid rewrite this time/))
  })

  it('reads a bad key or model out of an HTTP 400 body, as Gemini and OpenRouter report them', async () => {
    mockFetch(Response.json({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, { status: 400 }))
    await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(/rejected the API key.*Settings/))

    mockFetch(Response.json({ error: { code: 400, message: 'openai/gpt-4.1-minix is not a valid model ID' } }, { status: 400 }))
    await assert.rejects(request(AI_PROVIDERS.openRouter, { model: 'openai/gpt-4.1-minix' }), assertUserFacing(/does not know the model "openai\/gpt-4.1-minix"/))

    mockFetch(Response.json({ error: { message: 'Invalid JSON payload received.' } }, { status: 400 }))
    await assert.rejects(request(AI_PROVIDERS.groq), assertUserFacing(/HTTP 400.*Groq said: Invalid JSON payload/))
  })

  it('keeps a long provider message short and copes with a non-JSON error body', async () => {
    mockFetch(Response.json({ error: { message: 'x'.repeat(500) } }, { status: 400 }))
    await assert.rejects(request(AI_PROVIDERS.groq), (error: Error) => error.message.length < 260)

    mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }))
    await assert.rejects(request(AI_PROVIDERS.groq), assertUserFacing(/HTTP 502/))
  })

  it('reports blocked, declined, refused and cut-off replies in plain words', async () => {
    mockFetch(Response.json({ promptFeedback: { blockReason: 'SAFETY' } }))
    await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(/declined to rewrite/))

    mockFetch(Response.json(geminiReply([{ text: '{"rewritten": "Could you' }], 'MAX_TOKENS')))
    await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(/cut off.*shorter text/))

    mockFetch(Response.json(chatReply(null, 'content_filter')))
    await assert.rejects(request(AI_PROVIDERS.openRouter), assertUserFacing(/declined to rewrite/))

    mockFetch(Response.json({ choices: [{ message: { content: null, refusal: "I'm sorry, but I can't help with that." }, finish_reason: 'stop' }] }))
    await assert.rejects(request(AI_PROVIDERS.openRouter), assertUserFacing(/declined to rewrite.*OpenRouter said: I'm sorry/))

    mockFetch(Response.json(chatReply('{"rewritten": "Could you', 'length')))
    await assert.rejects(request(AI_PROVIDERS.groq), assertUserFacing(/cut off/))

    mockFetch(Response.json(geminiReply([{ text: '{"rewritten": "Could you' }], 'CONTINUATION')))
    await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(/cut off/))
    mockFetch(Response.json(geminiReply([{ text: '' }], 'LANGUAGE')))
    await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(/declined to rewrite/))
    mockFetch(Response.json(geminiReply([{ text: '{"rew' }], 'MALFORMED_RESPONSE')))
    await assert.rejects(request(AI_PROVIDERS.gemini), assertUserFacing(/broken reply/))
  })

  it('reports an empty reply, quoting a provider error hidden inside a 200 response', async () => {
    mockFetch(Response.json(chatReply('   ')))
    await assert.rejects(request(AI_PROVIDERS.groq), assertUserFacing(/returned no rewrite\. Try again\.$/))

    mockFetch(Response.json({ error: { message: 'Provider returned error', code: 502 } }))
    await assert.rejects(request(AI_PROVIDERS.openRouter), assertUserFacing(/returned no rewrite.*OpenRouter said: Provider returned error/))

    mockFetch(Response.json({ choices: [{ message: { content: null }, error: { message: 'Upstream overloaded' }, finish_reason: 'error' }] }))
    await assert.rejects(request(AI_PROVIDERS.openRouter), assertUserFacing(/OpenRouter said: Upstream overloaded/))
  })

  it('reports an unreachable provider as a user-facing error', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    await assert.rejects(request(AI_PROVIDERS.groq), assertUserFacing(/Could not reach Groq/))
  })

  it('aborts the request when asked, before or after the headers arrived, without blaming the provider', async () => {
    const calls = mockFetch(
      (init) =>
        new Promise<Response>((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        }),
    )
    const controller = new AbortController()
    const pending = request(AI_PROVIDERS.gemini, { signal: controller.signal })
    controller.abort()
    await assert.rejects(pending, assertUserFacing(/cancelled/))
    assert.equal(calls.length, 1)

    // Headers arrive, then the body stalls until the user cancels.
    mockFetch(
      (init) =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new TextEncoder().encode('{"choices": [{"message": {"content": "{\\"rewritten\\": '))
              init.signal.addEventListener('abort', () => stream.error(init.signal.reason))
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const lateController = new AbortController()
    const late = request(AI_PROVIDERS.groq, { signal: lateController.signal })
    setTimeout(() => lateController.abort(), 20)
    await assert.rejects(late, assertUserFacing(/cancelled/))
  })

  it('sends an overloaded request again, and explains the overload when it persists', async () => {
    const overloaded = () =>
      Response.json(
        { error: { code: 503, message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', status: 'UNAVAILABLE' } },
        { status: 503 },
      )
    const recovering = mockFetch(() => (recovering.length < 3 ? overloaded() : Response.json(geminiReply([{ text: REPLY }]))))
    assert.equal(await request(AI_PROVIDERS.gemini, { retryDelaysMs: [0, 0] }), REPLY)
    assert.equal(recovering.length, 3)

    const persisting = mockFetch(overloaded)
    await assert.rejects(
      request(AI_PROVIDERS.gemini, { retryDelaysMs: [0, 0] }),
      assertUserFacing(/overloaded right now.*Settings.*Google Gemini said: This model is currently experiencing high demand/),
    )
    assert.equal(persisting.length, 3)
  })

  it('stops retrying when the user cancels during the wait between attempts', async () => {
    const calls = mockFetch(() => Response.json({ error: { code: 503, message: 'High demand', status: 'UNAVAILABLE' } }, { status: 503 }))
    const controller = new AbortController()
    const pending = request(AI_PROVIDERS.gemini, { signal: controller.signal, retryDelaysMs: [10_000] })
    setTimeout(() => controller.abort(), 20)
    await assert.rejects(pending, assertUserFacing(/cancelled/))
    assert.equal(calls.length, 1)
  })

  it('refuses unknown providers before sending anything', async () => {
    const calls = mockFetch(Response.json(chatReply(REPLY)))
    for (const provider of ['openai', 'constructor', undefined]) {
      await assert.rejects(request(provider as AiProvider), assertUserFacing(/not available/), String(provider))
    }
    assert.equal(calls.length, 0)
  })
})
