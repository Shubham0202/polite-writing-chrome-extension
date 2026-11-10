import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_PROVIDERS, AI_PROVIDER_DEFAULT_MODEL, REWRITE_STYLES, type AiSettings, type RewriteStyle } from '../constants/ai.ts'
import { ENGINES, ENGINE_STATUS, MAX_TEXT_LENGTH, REWRITE_ACTION } from '../constants/corrections.ts'
import type { AiRewriteRequest } from '../engines/rewrite/aiProviders.ts'
import { UserFacingError } from '../utils/errors.ts'
import { createWritingEnhancer } from './writingEnhancer.ts'

const SETTINGS: AiSettings = { provider: AI_PROVIDERS.gemini, apiKey: 'sk-test', model: '' }
const EXAMPLE = 'Hey shubham sir can I get the work from home for 2 days of next week that is Thursday and Friday. is this sentence is correct'
const EXAMPLE_REWRITE = 'Hey Shubham Sir, I wanted to ask if I could work from home on Thursday and Friday next week.'

// A provider that answers with the given text (or fails) and records what it was asked.
const createEnhancer = (reply: string | Error | ((request: AiRewriteRequest) => string), settings: AiSettings = SETTINGS) => {
  const calls: AiRewriteRequest[] = []
  const requestRewrite = async (request: AiRewriteRequest) => {
    calls.push(request)
    if (reply instanceof Error) throw reply
    return typeof reply === 'function' ? reply(request) : JSON.stringify({ rewritten: reply })
  }
  return { calls, rewrite: createWritingEnhancer({ getAiSettings: async () => settings, requestRewrite }) }
}

const assertUserFacing = (pattern: RegExp) => (error: unknown) => {
  assert.ok(error instanceof UserFacingError, `${error} is user-facing`)
  assert.match(error.message, pattern)
  return true
}

describe('writing enhancer', () => {
  it('rejects empty, too-long and unknown-style requests before asking the provider', async () => {
    const { calls, rewrite } = createEnhancer(EXAMPLE_REWRITE)
    await assert.rejects(rewrite({ text: '   ', style: REWRITE_STYLES.polite }), assertUserFacing(/Enter some text/))
    await assert.rejects(rewrite({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1), style: REWRITE_STYLES.polite }), assertUserFacing(/too long/))
    await assert.rejects(rewrite({ text: 'Hello.', style: 'rude' as string as RewriteStyle }), assertUserFacing(/not available/))
    await assert.rejects(rewrite({ text: 'Hello.', style: 'constructor' as string as RewriteStyle }), assertUserFacing(/not available/))
    await assert.rejects(rewrite(), assertUserFacing(/Enter some text/))
    assert.equal(calls.length, 0)
  })

  it('turns a failing settings read into a plain message, without asking the provider', async () => {
    const calls: AiRewriteRequest[] = []
    const rewrite = createWritingEnhancer({
      getAiSettings: async () => {
        throw new Error('QUOTA_BYTES exceeded')
      },
      requestRewrite: async (request) => calls.push(request),
    })
    const originalConsoleError = console.error
    console.error = () => {}
    await assert.rejects(rewrite({ text: EXAMPLE, style: REWRITE_STYLES.polite }), assertUserFacing(/Could not read the AI settings/))
    console.error = originalConsoleError
    assert.equal(calls.length, 0)
  })

  it('refuses to run without an API key, without asking the provider', async () => {
    const { calls, rewrite } = createEnhancer(EXAMPLE_REWRITE, { ...SETTINGS, apiKey: '' })
    await assert.rejects(rewrite({ text: EXAMPLE, style: REWRITE_STYLES.polite }), assertUserFacing(/Add an API key in Settings/))
    assert.equal(calls.length, 0)
  })

  it('sends the provider, key, model, prompt and signal from the request and Settings', async () => {
    const { calls, rewrite } = createEnhancer(EXAMPLE_REWRITE)
    const controller = new AbortController()
    await rewrite({ text: EXAMPLE, style: REWRITE_STYLES.professional, signal: controller.signal })
    const [call] = calls
    assert.equal(call.provider, AI_PROVIDERS.gemini)
    assert.equal(call.apiKey, 'sk-test')
    assert.equal(call.model, AI_PROVIDER_DEFAULT_MODEL[AI_PROVIDERS.gemini])
    assert.equal(call.signal, controller.signal)
    assert.match(call.prompt.system, /Rules:/)
    assert.match(call.prompt.user, /^Style: Make professional/)
    assert.ok(call.prompt.user.endsWith(`<text>\n${EXAMPLE}\n</text>`))

    const custom = createEnhancer(EXAMPLE_REWRITE, { provider: AI_PROVIDERS.groq, apiKey: 'gsk', model: 'qwen/qwen3.8-27b' })
    await custom.rewrite({ text: EXAMPLE, style: REWRITE_STYLES.polite })
    assert.equal(custom.calls[0].model, 'qwen/qwen3.8-27b')
  })

  it('returns the rewrite in the correction result shape', async () => {
    const { rewrite } = createEnhancer(EXAMPLE_REWRITE)
    const result = await rewrite({ text: EXAMPLE, style: REWRITE_STYLES.improveWording })
    assert.equal(result.action, REWRITE_ACTION)
    assert.equal(result.style, REWRITE_STYLES.improveWording)
    assert.equal(result.original, EXAMPLE)
    assert.equal(result.corrected, EXAMPLE_REWRITE)
    assert.equal(result.suggestions.length, 1)
    assert.equal(result.suggestions[0].id, 'rewrite-0')
    assert.equal(result.suggestions[0].engine, ENGINES.rewrite)
    assert.deepEqual(result.engines, [{ label: 'AI rewrite (Google Gemini)', status: ENGINE_STATUS.used, message: null }])
  })

  it('offers each rewritten sentence on its own when they line up', async () => {
    const text = 'i am not coming office today. Thanks for helping me, I will tell you if need anything.'
    const rewritten = "I won't be able to come to the office today. Thanks for your help, and I'll let you know if I need anything else."
    const { rewrite } = createEnhancer(rewritten, { ...SETTINGS, provider: AI_PROVIDERS.openRouter })
    const result = await rewrite({ text, style: REWRITE_STYLES.friendly })
    assert.deepEqual(result.suggestions.map(({ id }) => id), ['rewrite-0', 'rewrite-1'])
    assert.equal(result.corrected, rewritten)
    assert.equal(result.engines[0].label, 'AI rewrite (OpenRouter)')
  })

  it('reports an unchanged text instead of an empty change, including whitespace-only and apostrophe-only differences', async () => {
    for (const [text, reply] of [
      ['Could you please send me the file by Friday?', 'Could you please send me the file by Friday?'],
      ['Thanks for the update.  Send me the logs.\n', 'Thanks for the update. Send me the logs.'],
      ["I don’t know. It’s fine.", "I don't know. It's fine."],
      ["I don't know if it's fine.", 'I don’t know if it’s fine.'],
    ]) {
      const { rewrite } = createEnhancer(reply)
      const result = await rewrite({ text, style: REWRITE_STYLES.polite })
      assert.deepEqual(result.suggestions, [], text)
      assert.equal(result.corrected, text)
      assert.match(result.engines[0].message!, /nothing to improve/)
    }
  })

  it('falls back to one whole-text suggestion when a sentence-level set would not survive the safety checks whole', async () => {
    const text = 'Please see https://example.com/spec today. Then send me your notes.'
    const rewritten = 'Please take a look today. Then send me your notes on https://example.com/spec.'
    const { rewrite } = createEnhancer(rewritten)
    const result = await rewrite({ text, style: REWRITE_STYLES.polite })
    assert.equal(result.suggestions.length, 1)
    assert.equal(result.suggestions[0].original, text)
    assert.equal(result.corrected, rewritten)

    // A polite expansion of a short sentence stays sentence-level; only a runaway one falls back to the whole text.
    const short = 'Ok thanks. Send me the report by Friday.'
    const first = 'Okay, thanks so much for confirming this quickly today, since it really helps me plan the rest of my week properly and calmly.'
    const grown = createEnhancer(`${first} Could you please send me the report by Friday?`)
    assert.equal((await grown.rewrite({ text: short, style: REWRITE_STYLES.polite })).suggestions.length, 2)

    const runaway = `Okay, thanks a lot for confirming this ${Array.from({ length: 29 }, (_, index) => `detail${index}`).join(' ')}.`
    const runawayResult = await createEnhancer(`${runaway} Could you please send me the report by Friday?`).rewrite({ text: short, style: REWRITE_STYLES.polite })
    assert.equal(runawayResult.suggestions.length, 1)
    assert.equal(runawayResult.suggestions[0].original, short)
    assert.equal(runawayResult.corrected, `${runaway} Could you please send me the report by Friday?`)
  })

  it('keeps links, emails and mentions only when the rewrite carries them through unchanged and adds none', async () => {
    const text = 'pls see https://example.com/docs?a=1 and mail info@company.com, @raj can you check it'
    const kept = 'Please see https://example.com/docs?a=1 and email info@company.com. @raj, could you check it?'
    const { rewrite } = createEnhancer(kept)
    assert.equal((await rewrite({ text, style: REWRITE_STYLES.polite })).corrected, kept)

    const dropped = createEnhancer('Please see the docs and email the company. Could you check it?')
    await assert.rejects(dropped.rewrite({ text, style: REWRITE_STYLES.polite }), assertUserFacing(/changed or dropped "https:\/\/example.com\/docs\?a=1"/))

    const injected = createEnhancer('Please see https://example.com/docs?a=1 and mail info@company.com, @raj. Also read http://evil.test now.')
    await assert.rejects(injected.rewrite({ text, style: REWRITE_STYLES.polite }), assertUserFacing(/added "http:\/\/evil.test"/))

    const template = createEnhancer('Hi {{First Name}}, your order [order_id] ships on [date].')
    await assert.rejects(template.rewrite({ text: 'hi {{FirstName}}, your order [order_id] ships on [date]', style: REWRITE_STYLES.polite }), assertUserFacing(/dropped "\{\{FirstName\}\}"/))
  })

  it('points out numbers the rewrite altered, and keeps whitespace and paragraph breaks the writer would notice', async () => {
    const altered = createEnhancer('Could we meet at 5 am on the 16th?')
    const result = await altered.rewrite({ text: 'Can we meet at 5 pm on the 15th?', style: REWRITE_STYLES.polite })
    assert.equal(result.corrected, 'Could we meet at 5 am on the 16th?')
    assert.match(result.engines[0].message!, /changed or dropped these numbers: "16", "15"/)

    const padded = createEnhancer('Thanks for the help.')
    assert.equal((await padded.rewrite({ text: ' thanks for the help\n\n', style: REWRITE_STYLES.polite })).corrected, ' Thanks for the help.\n\n')

    const paragraphs = 'Hi team.\n\nThe build failed.\n\nThanks.'
    const split = createEnhancer(paragraphs)
    const splitResult = await split.rewrite({ text: 'Hi team. The build failed. Thanks.', style: REWRITE_STYLES.clarity })
    assert.equal(splitResult.suggestions.length, 1)
    assert.equal(splitResult.corrected, paragraphs)

    const stutter = createEnhancer('Okay, bye bye!')
    assert.equal((await stutter.rewrite({ text: 'ok bye', style: REWRITE_STYLES.friendly })).corrected, 'Okay, bye bye!')
  })

  it('accepts a polite expansion of a short command, but refuses a rewrite that grows out of proportion', async () => {
    const polite = 'Could you please take a look at this and fix it when you have a moment? Thank you so much for your help with it.'
    const { rewrite } = createEnhancer(polite)
    assert.equal((await rewrite({ text: 'Fix it.', style: REWRITE_STYLES.polite })).corrected, polite)

    const bloat = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')
    const bloated = createEnhancer(`Could you please do it? ${bloat}.`)
    await assert.rejects(bloated.rewrite({ text: 'do it', style: REWRITE_STYLES.polite }), assertUserFacing(/safety checks/))
  })

  it('refuses an answer that is just one of the prompt examples for a different text', async () => {
    const leaked = createEnhancer(EXAMPLE_REWRITE)
    await assert.rejects(leaked.rewrite({ text: 'pls approve my leave for monday', style: REWRITE_STYLES.polite }), assertUserFacing(/unrelated text/))
  })

  it('passes provider and parsing failures on as user-facing errors', async () => {
    const unreachable = createEnhancer(new UserFacingError('Could not reach Groq. Check your internet connection.'))
    await assert.rejects(unreachable.rewrite({ text: EXAMPLE, style: REWRITE_STYLES.polite }), assertUserFacing(/Could not reach Groq/))

    const prose = createEnhancer(() => 'Sure! Here is a better version.')
    await assert.rejects(prose.rewrite({ text: EXAMPLE, style: REWRITE_STYLES.polite }), assertUserFacing(/unexpected response/))
  })
})
