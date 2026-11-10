import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { CATEGORIES, CONFIDENCE, SOURCES } from '../../constants/corrections.ts'
import { UserFacingError } from '../../utils/errors.ts'
import { checkWithLanguageTool } from './languageTool.ts'

const OPTIONS = { serverUrl: 'http://localhost:8081', language: 'en-US' }
const TEXT = "can you check it. He don't know. I recieve it."
const originalFetch = globalThis.fetch

// Shape copied from a real LanguageTool /v2/check response.
const RESPONSE_BODY = {
  matches: [
    { message: 'This sentence does not start with an uppercase letter.', offset: 0, length: 3, replacements: [{ value: 'Can' }], rule: { id: 'UPPERCASE_SENTENCE_START', issueType: 'typographical', category: { id: 'CASING' } } },
    { message: 'If this is a question, use a question mark.', offset: 16, length: 1, replacements: [{ value: '?' }], rule: { id: 'QUESTION_MARK', issueType: 'uncategorized', category: { id: 'PUNCTUATION' } } },
    { message: "The pronoun 'He' is usually used with a third-person verb.", offset: 21, length: 2, replacements: [{ value: 'does' }, { value: 'did' }], rule: { id: 'HE_VERB_AGR', issueType: 'grammar', category: { id: 'GRAMMAR' } } },
    { message: 'Possible spelling mistake found.', offset: 37, length: 7, replacements: [{ value: 'receive' }], rule: { id: 'MORFOLOGIK_RULE_EN_US', issueType: 'misspelling', category: { id: 'TYPOS' } } },
    { message: 'Consider a shorter phrase.', offset: 4, length: 3, replacements: [{ value: 'u' }], rule: { id: 'STYLE', issueType: 'style', category: { id: 'STYLE' } } },
    { message: 'Broken offsets', offset: 400, length: 3, replacements: [{ value: 'x' }], rule: { id: 'BROKEN', category: { id: 'GRAMMAR' } } },
  ],
}

// The client always sends a URLSearchParams body and an abort signal, so the mocks can rely on both.
interface MockFetchInit extends RequestInit {
  body: URLSearchParams
  signal: AbortSignal
}

const mockFetch = (implementation: (url: string, init: MockFetchInit) => Promise<Response>): void => {
  globalThis.fetch = implementation as typeof fetch
}

describe('LanguageTool client', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('maps grammar matches, skips spelling matches and invalid offsets', async () => {
    let request!: { url: string; body: string }
    mockFetch(async (url, init) => {
      request = { url, body: init.body.toString() }
      return new Response(JSON.stringify(RESPONSE_BODY))
    })

    const suggestions = await checkWithLanguageTool(TEXT, OPTIONS)

    assert.equal(request.url, 'http://localhost:8081/v2/check')
    assert.match(request.body, /language=en-US/)
    assert.deepEqual(
      suggestions.map(({ original, replacements, category, confidence, source }) => ({ original, replacements, category, confidence, source })),
      [
        { original: 'can', replacements: ['Can'], category: CATEGORIES.capitalization, confidence: CONFIDENCE.high, source: SOURCES.languageTool },
        { original: '.', replacements: ['?'], category: CATEGORIES.punctuation, confidence: CONFIDENCE.high, source: SOURCES.languageTool },
        { original: 'do', replacements: ['does', 'did'], category: CATEGORIES.grammar, confidence: CONFIDENCE.high, source: SOURCES.languageTool },
        { original: 'you', replacements: ['u'], category: CATEGORIES.style, confidence: CONFIDENCE.low, source: SOURCES.languageTool },
      ],
    )
  })

  it('reports a user-facing error when the server is not running', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await assert.rejects(checkWithLanguageTool(TEXT, OPTIONS), (error) => {
      assert.ok(error instanceof UserFacingError)
      assert.equal(error.message, 'LanguageTool is not running at http://localhost:8081.')
      return true
    })
  })

  it('uses the configured message when an online server cannot be reached', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const options = { ...OPTIONS, serverUrl: 'https://api.languagetool.org', unreachableMessage: 'Could not reach LanguageTool online.' }
    await assert.rejects(checkWithLanguageTool(TEXT, options), (error) => {
      assert.ok(error instanceof UserFacingError)
      assert.equal(error.message, 'Could not reach LanguageTool online.')
      return true
    })
  })

  it('aborts the request when asked, without blaming the server', async () => {
    mockFetch(
      (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        }),
    )
    const controller = new AbortController()
    const check = checkWithLanguageTool(TEXT, { ...OPTIONS, signal: controller.signal })
    controller.abort()
    await assert.rejects(check, (error) => {
      assert.ok(error instanceof UserFacingError)
      assert.equal(error.message, 'The grammar check was cancelled.')
      return true
    })
  })

  it('explains when the request limit is reached', async () => {
    mockFetch(async () => new Response('Too many requests', { status: 429 }))
    await assert.rejects(checkWithLanguageTool(TEXT, OPTIONS), /request limit was reached/)
  })

  it('reports HTTP errors and unexpected responses', async () => {
    mockFetch(async () => new Response('busy', { status: 503 }))
    await assert.rejects(checkWithLanguageTool(TEXT, OPTIONS), /HTTP 503/)

    mockFetch(async () => new Response('<html>not json</html>'))
    await assert.rejects(checkWithLanguageTool(TEXT, OPTIONS), /unexpected response/)

    mockFetch(async () => new Response(JSON.stringify({ result: [] })))
    await assert.rejects(checkWithLanguageTool(TEXT, OPTIONS), /unexpected response/)
  })
})
