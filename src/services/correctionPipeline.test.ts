import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import dictionary from 'dictionary-en'
import { CORRECTION_ACTIONS, ENGINES, ENGINE_STATUS, MAX_TEXT_LENGTH, TONES, type CorrectionAction, type Tone } from '../constants/corrections.ts'
import { DEFAULT_SETTINGS, type Settings } from '../constants/settings.ts'
import { createSpellChecker } from '../engines/spelling/spellChecker.ts'
import { CORRECT_SENTENCES } from '../fixtures/sentences.ts'
import { createCorrectionPipeline, type CorrectionPipeline, type CorrectionRequest, type CorrectionResult, type EngineReport } from './correctionPipeline.ts'

const spellChecker = createSpellChecker(dictionary)
const runPipeline = createCorrectionPipeline({
  getSpellChecker: () => spellChecker,
  languageToolOptions: { serverUrl: 'http://localhost:8081', language: 'en-US' },
  onlineLanguageToolOptions: { serverUrl: 'https://api.languagetool.org', language: 'en-US', unreachableMessage: 'Could not reach LanguageTool online.' },
})
const originalFetch = globalThis.fetch
const EXAMPLE = 'can you check the current ticket info'

// Tests read the report's fields directly, so a missing report fails there instead of in the type.
const findReport = (result: CorrectionResult, label: string): EngineReport => result.engines.find((report) => report.label === label) as EngineReport

describe('correction pipeline', () => {
  beforeEach(() => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('the four buttons on the example sentence', () => {
    for (const [action, expected] of [
      [CORRECTION_ACTIONS.fixGrammar, 'Can you check the current ticket info?'],
      [CORRECTION_ACTIONS.makePolite, 'Could you please check the current ticket information?'],
      [CORRECTION_ACTIONS.professional, 'Could you please review the information in the current ticket?'],
      [CORRECTION_ACTIONS.fixEverything, 'Could you please check the current ticket information?'],
    ] satisfies Array<[CorrectionAction, string]>) {
      it(`${action} → "${expected}"`, async () => {
        const result = await runPipeline({ text: EXAMPLE, action })
        assert.equal(result.corrected, expected)
        assert.equal(result.original, EXAMPLE)
      })
    }

    it('fix-everything with the professional tone', async () => {
      const result = await runPipeline({ text: EXAMPLE, action: CORRECTION_ACTIONS.fixEverything, tone: TONES.professional })
      assert.equal(result.corrected, 'Could you please review the information in the current ticket?')
    })
  })

  it('reports LanguageTool as unavailable and still applies local grammar rules', async () => {
    const result = await runPipeline({ text: "He don't know.", action: CORRECTION_ACTIONS.fixGrammar })
    const languageTool = findReport(result, 'Grammar (LanguageTool)')
    assert.equal(languageTool.status, ENGINE_STATUS.unavailable)
    assert.equal(languageTool.message, 'LanguageTool is not running at http://localhost:8081. Grammar was checked with local rules only.')
    assert.equal(findReport(result, 'Grammar (local rules)').status, ENGINE_STATUS.used)
    assert.equal(result.corrected, "He doesn't know.")
  })

  it('uses LanguageTool when it is running, preferring local rules where both overlap', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          matches: [
            { message: 'Use a third-person plural verb with ‘they’.', offset: 5, length: 3, replacements: [{ value: 'are' }, { value: 'were' }], rule: { id: 'PERS_PRONOUN_AGREEMENT', issueType: 'grammar', category: { id: 'GRAMMAR' } } },
            { message: 'Did you mean "than"?', offset: 30, length: 4, replacements: [{ value: 'than' }], rule: { id: 'THEN_THAN', issueType: 'grammar', category: { id: 'CONFUSED_WORDS' } } },
          ],
        }),
      )
    const text = 'They was working longer hours then usual.'
    const result = await runPipeline({ text, action: CORRECTION_ACTIONS.fixGrammar })
    assert.equal(findReport(result, 'Grammar (LanguageTool)').status, ENGINE_STATUS.used)
    assert.equal(result.corrected, 'They were working longer hours than usual.')
  })

  describe('online grammar', () => {
    const recordRequests = () => {
      const urls: unknown[] = []
      globalThis.fetch = async (url) => {
        urls.push(url)
        return new Response(JSON.stringify({ matches: [] }))
      }
      return urls
    }

    it('stays on the local server unless it is switched on', async () => {
      const urls = recordRequests()
      const result = await runPipeline({ text: 'Hello there.', action: CORRECTION_ACTIONS.fixGrammar })
      assert.deepEqual(urls, ['http://localhost:8081/v2/check'])
      assert.equal(findReport(result, 'Grammar (LanguageTool)').status, ENGINE_STATUS.used)
    })

    for (const action of [CORRECTION_ACTIONS.fixGrammar, CORRECTION_ACTIONS.fixEverything]) {
      it(`${action} uses the online service when switched on, and reports it`, async () => {
        const urls = recordRequests()
        const result = await runPipeline({ text: 'Hello there.', action, isOnlineGrammarEnabled: true })
        assert.deepEqual(urls, ['https://api.languagetool.org/v2/check'])
        assert.equal(findReport(result, 'Grammar (LanguageTool online)').status, ENGINE_STATUS.used)
        assert.equal(findReport(result, 'Grammar (LanguageTool)'), undefined)
      })
    }

    it('sends nothing for tone-only actions', async () => {
      const urls = recordRequests()
      await runPipeline({ text: 'send me the file', action: CORRECTION_ACTIONS.makePolite, isOnlineGrammarEnabled: true })
      await runPipeline({ text: 'send me the file', action: CORRECTION_ACTIONS.professional, isOnlineGrammarEnabled: true })
      assert.deepEqual(urls, [])
    })

    it('falls back to local rules when the online service cannot be reached', async () => {
      const result = await runPipeline({ text: "He don't know.", action: CORRECTION_ACTIONS.fixGrammar, isOnlineGrammarEnabled: true })
      const languageTool = findReport(result, 'Grammar (LanguageTool online)')
      assert.equal(languageTool.status, ENGINE_STATUS.unavailable)
      assert.equal(languageTool.message, 'Could not reach LanguageTool online. Grammar was checked with local rules only.')
      assert.equal(result.corrected, "He doesn't know.")
    })
  })

  describe('inline check', () => {
    const createInlinePipeline = () =>
      createCorrectionPipeline({
        getSpellChecker: () => spellChecker,
        languageToolOptions: { serverUrl: 'http://localhost:8081', language: 'en-US' },
        onlineLanguageToolOptions: { serverUrl: 'https://api.languagetool.org', language: 'en-US' },
      })
    const inlineCheck = (pipeline: CorrectionPipeline, text: string, request?: Partial<Omit<CorrectionRequest, 'text' | 'action'>>) => pipeline({ text, action: CORRECTION_ACTIONS.inlineCheck, ...request })

    const countRequests = ({ status = 200 } = {}) => {
      const urls: unknown[] = []
      globalThis.fetch = async (url) => {
        urls.push(url)
        return new Response(JSON.stringify({ matches: [] }), { status })
      }
      return urls
    }

    it('returns corrections, with tone rewrites offered separately', async () => {
      const { suggestions, toneAlternatives } = await inlineCheck(createInlinePipeline(), 'i recieve the report. send me the file')
      assert.deepEqual([...new Set(suggestions.map(({ engine }) => engine))].sort(), [ENGINES.grammar, ENGINES.spelling])
      assert.ok(suggestions.every(({ engine }) => engine !== ENGINES.tone))

      for (const tone of Object.values(TONES)) {
        assert.ok(toneAlternatives[tone].length > 0, tone)
        assert.ok(toneAlternatives[tone].every(({ engine, id }) => engine === ENGINES.tone && id.startsWith(tone)), tone)
      }
    })

    it('builds tone rewrites on the corrected sentence', async () => {
      const { toneAlternatives } = await inlineCheck(createInlinePipeline(), 'send me the recieve file')
      assert.match(toneAlternatives[TONES.polite][0].replacements[0], /receive/)
      assert.ok(toneAlternatives[TONES.polite][0].includedCorrections.length > 0)
    })

    it('gives every suggestion its own id', async () => {
      const { suggestions, toneAlternatives } = await inlineCheck(createInlinePipeline(), 'i recieve it. send me the file')
      const ids = [...suggestions, ...Object.values(toneAlternatives).flat()].map(({ id }) => id)
      assert.equal(new Set(ids).size, ids.length)
    })

    it('never uses the online service, even with the switch on', async () => {
      const urls = countRequests()
      await inlineCheck(createInlinePipeline(), 'Hello there.', { isOnlineGrammarEnabled: true })
      assert.deepEqual(urls, ['http://localhost:8081/v2/check'])
    })

    it('leaves a failed server alone for a minute, then tries it again', async () => {
      mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
      const urls = countRequests({ status: 500 })
      const pipeline = createInlinePipeline()
      const first = await inlineCheck(pipeline, 'Hello there.')
      const second = await inlineCheck(pipeline, 'Hello again.')
      assert.equal(urls.length, 1)
      assert.equal(findReport(first, 'Grammar (LanguageTool)').status, ENGINE_STATUS.unavailable)
      assert.equal(findReport(second, 'Grammar (LanguageTool)').status, ENGINE_STATUS.unavailable)

      mock.timers.tick(60_000)
      await inlineCheck(pipeline, 'Hello once more.')
      assert.equal(urls.length, 2)
      mock.timers.reset()
    })

    it('does not treat a cancelled check as a server failure', async () => {
      const urls: unknown[] = []
      globalThis.fetch = ((url: RequestInfo | URL, init: { signal: AbortSignal }) =>
        new Promise<Response>((resolve, reject) => {
          urls.push(url)
          if (init.signal.aborted) reject(init.signal.reason)
          else init.signal.addEventListener('abort', () => reject(init.signal.reason))
        })) as typeof fetch
      const pipeline = createInlinePipeline()
      const controller = new AbortController()
      const check = inlineCheck(pipeline, 'Hello there.', { signal: controller.signal })
      controller.abort()
      await check

      countRequests()
      await inlineCheck(pipeline, 'Hello there.')
      assert.equal(urls.length, 1)
      assert.ok(findReport(await inlineCheck(pipeline, 'Hello again.'), 'Grammar (LanguageTool)').status === ENGINE_STATUS.used)
    })

    it('does not pause LanguageTool for the popup buttons after an inline failure', async () => {
      const urls = countRequests({ status: 500 })
      const pipeline = createInlinePipeline()
      await inlineCheck(pipeline, 'Hello there.')
      await pipeline({ text: 'Hello there.', action: CORRECTION_ACTIONS.fixGrammar })
      assert.equal(urls.length, 2)
    })
  })

  it('leaves words the user chose to ignore alone, in every kind of check', async () => {
    const pipeline = createCorrectionPipeline({
      getSpellChecker: () => spellChecker,
      getIgnoredWords: async () => ['recieve'],
      languageToolOptions: { serverUrl: 'http://localhost:8081', language: 'en-US' },
      onlineLanguageToolOptions: { serverUrl: 'https://api.languagetool.org', language: 'en-US' },
    })
    for (const action of [CORRECTION_ACTIONS.fixGrammar, CORRECTION_ACTIONS.inlineCheck]) {
      const { suggestions } = await pipeline({ text: 'I Recieve it, recieve it and teh rest.', action })
      assert.deepEqual(suggestions.filter(({ engine }) => engine === ENGINES.spelling).map(({ original }) => original), ['teh'], action)
    }
  })

  describe('settings', () => {
    const TEXT = 'They was late and i recieve it. Send me the file.'
    const createPipelineWith = (changes: Partial<Settings>) =>
      createCorrectionPipeline({
        getSpellChecker: () => spellChecker,
        getSettings: async () => ({ ...DEFAULT_SETTINGS, ...changes }),
        languageToolOptions: { serverUrl: 'http://localhost:8081', language: 'en-US' },
        onlineLanguageToolOptions: { serverUrl: 'https://api.languagetool.org', language: 'en-US' },
      })
    const inlineCheck = (changes: Partial<Settings>) => createPipelineWith(changes)({ text: TEXT, action: CORRECTION_ACTIONS.inlineCheck })
    const usedEngines = ({ suggestions }: CorrectionResult) => new Set(suggestions.map(({ engine }) => engine))

    it('runs everything by default', async () => {
      const result = await inlineCheck({})
      assert.ok(usedEngines(result).has(ENGINES.spelling))
      assert.ok(usedEngines(result).has(ENGINES.grammar))
      assert.ok(result.toneAlternatives[TONES.polite].length > 0)
      assert.ok(result.toneAlternatives[TONES.professional].length > 0)
    })

    it('skips spelling when it is off', async () => {
      assert.equal(usedEngines(await inlineCheck({ isSpellingEnabled: false })).has(ENGINES.spelling), false)
    })

    it('skips grammar, tense and LanguageTool when grammar is off', async () => {
      const urls: unknown[] = []
      globalThis.fetch = async (url) => {
        urls.push(url)
        return new Response(JSON.stringify({ matches: [] }))
      }
      const result = await inlineCheck({ isGrammarEnabled: false })
      assert.deepEqual([...usedEngines(result)], [ENGINES.spelling])
      assert.deepEqual(urls, [])
    })

    it('skips each kind of rewrite when it is off, keeping the shape of the result', async () => {
      const { toneAlternatives } = await inlineCheck({ isPoliteEnabled: false })
      assert.deepEqual(toneAlternatives[TONES.polite], [])
      assert.ok(toneAlternatives[TONES.professional].length > 0)
    })

    it('still returns a usable result with everything off', async () => {
      const result = await inlineCheck({ isSpellingEnabled: false, isGrammarEnabled: false, isPoliteEnabled: false, isProfessionalEnabled: false })
      assert.deepEqual(result.suggestions, [])
      assert.deepEqual(result.toneAlternatives, { [TONES.polite]: [], [TONES.professional]: [] })
    })

    it('does not limit the popup buttons, which the user pressed on purpose', async () => {
      const pipeline = createPipelineWith({ isSpellingEnabled: false, isGrammarEnabled: false })
      const { suggestions } = await pipeline({ text: TEXT, action: CORRECTION_ACTIONS.fixGrammar })
      assert.ok(new Set(suggestions.map(({ engine }) => engine)).has(ENGINES.spelling))
    })
  })

  it('combines every engine on a multi-sentence workplace message', async () => {
    const text = 'sir i am not able to complete this task because i was facing some issue yesterday. i have saw the recieve error'
    const result = await runPipeline({ text, action: CORRECTION_ACTIONS.fixEverything, tone: TONES.professional })
    assert.equal(
      result.corrected,
      'Sir, I am unable to complete this task because I was experiencing an issue yesterday. I apologize for the delay. I have seen the receive error.',
    )
    const [toneSuggestion] = result.suggestions
    const explanations = toneSuggestion.includedCorrections.map((correction) => correction.explanation)
    assert.equal(explanations.length, 3, 'tone rewrite lists each included correction once')
    assert.equal(new Set(explanations).size, explanations.length)
  })

  it('makes no corrections to correct sentences', async () => {
    for (const text of CORRECT_SENTENCES) {
      const result = await runPipeline({ text, action: CORRECTION_ACTIONS.fixGrammar })
      assert.equal(result.corrected, text, text)
    }
  })

  it('only changes the tone of correct sentences with Fix Everything', async () => {
    for (const text of CORRECT_SENTENCES) {
      const result = await runPipeline({ text, action: CORRECTION_ACTIONS.fixEverything })
      const corrections = result.suggestions.filter((suggestion) => suggestion.engine !== ENGINES.tone || suggestion.includedCorrections.length)
      assert.deepEqual(corrections, [], text)
    }
  })

  it('leaves already-polite workplace messages unchanged', async () => {
    const text = 'Hi team, could you please share the release notes? Thank you for your help.'
    for (const action of [CORRECTION_ACTIONS.makePolite, CORRECTION_ACTIONS.fixGrammar]) {
      const result = await runPipeline({ text, action })
      assert.deepEqual(result.suggestions, [], action)
    }
  })

  it('keeps uncertain suggestions visible but unapplied', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          matches: [{ message: 'This phrase is wordy.', offset: 0, length: 12, replacements: [{ value: 'To' }], rule: { id: 'WORDY', issueType: 'style', category: { id: 'STYLE' } } }],
        }),
      )
    const text = 'In order to ship, we wait.'
    const result = await runPipeline({ text, action: CORRECTION_ACTIONS.fixGrammar })
    assert.equal(result.suggestions.length, 1)
    assert.equal(result.corrected, text)
  })

  it('rejects empty, too-long and unknown requests with user-facing messages', async () => {
    await assert.rejects(runPipeline({ text: '   ', action: CORRECTION_ACTIONS.fixGrammar }), /Enter some text/)
    await assert.rejects(runPipeline({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1), action: CORRECTION_ACTIONS.fixGrammar }), /too long/)
    await assert.rejects(runPipeline({ text: 'Hello.', action: 'translate' as CorrectionAction }), /not available/)
    await assert.rejects(runPipeline({ text: 'Hello.', action: CORRECTION_ACTIONS.fixEverything, tone: 'rude' as Tone }), /not available/)
  })

  it('reports a broken engine without losing the others', async () => {
    const pipelineWithBrokenSpeller = createCorrectionPipeline({
      getSpellChecker: () => {
        throw new Error('dictionary failed to load')
      },
      languageToolOptions: { serverUrl: 'http://localhost:8081', language: 'en-US' },
      onlineLanguageToolOptions: { serverUrl: 'https://api.languagetool.org', language: 'en-US' },
    })
    const originalConsoleError = console.error
    console.error = () => {}
    const result = await pipelineWithBrokenSpeller({ text: 'they was late', action: CORRECTION_ACTIONS.fixGrammar })
    console.error = originalConsoleError

    assert.equal(findReport(result, 'Spelling (nspell)').status, ENGINE_STATUS.failed)
    assert.equal(result.corrected, 'They were late')
  })

  it('treats Object member names as ordinary text in every action', async () => {
    for (const text of ['constructor', 'The constructor work fine.', '__proto__ toString valueOf']) {
      for (const action of Object.values(CORRECTION_ACTIONS)) {
        const result = await runPipeline({ text, action })
        assert.doesNotMatch(result.corrected, /function|\[object|undefined/, `${action}: ${text}`)
      }
    }
    await assert.rejects(runPipeline({ text: 'Hello.', action: 'constructor' as CorrectionAction }), /not available/)
    await assert.rejects(runPipeline({ text: 'Hello.', action: CORRECTION_ACTIONS.fixEverything, tone: 'constructor' as Tone }), /not available/)
  })

  it('never changes URLs, emails or inline code', async () => {
    const text = 'pls check https://example.com/info?a,b and mail info@company.com about `i recieve` asap'
    for (const action of Object.values(CORRECTION_ACTIONS)) {
      const { corrected } = await runPipeline({ text, action })
      for (const span of ['https://example.com/info?a,b', 'info@company.com', '`i recieve`']) {
        assert.ok(corrected.includes(span), `${action} kept ${span}: ${corrected}`)
      }
    }
  })

  it('never doubles punctuation when a sentence is rewritten', async () => {
    for (const text of ['Send it.Thanks', 'can you check the current ticket info', 'send me the file']) {
      const { corrected } = await runPipeline({ text, action: CORRECTION_ACTIONS.fixEverything })
      assert.doesNotMatch(corrected, /[.?!]\s*[.?]/, corrected)
    }
    assert.equal((await runPipeline({ text: 'Send it.Thanks', action: CORRECTION_ACTIONS.fixEverything })).corrected, 'Could you please send it? Thanks')
  })

  it('survives malformed LanguageTool responses', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          matches: [null, 'text', { offset: 0, length: 2, replacements: 'We', rule: { category: { id: 'constructor' } } }, { offset: 0, length: 2, replacements: [{ value: 7 }] }],
        }),
      )
    const result = await runPipeline({ text: 'we was late.', action: CORRECTION_ACTIONS.fixGrammar })
    assert.equal(findReport(result, 'Grammar (LanguageTool)').status, ENGINE_STATUS.used)
    assert.equal(result.corrected, 'We were late.')
  })

  it('reports partial spell checking instead of hanging on long non-English text', async () => {
    const text = 'kal mai office nahi aaunga kyunki meri tabiyat kharab hai aur doctor ne aaram karne bola '.repeat(55).slice(0, MAX_TEXT_LENGTH)
    const startedAt = performance.now()
    const result = await runPipeline({ text, action: CORRECTION_ACTIONS.fixGrammar })
    assert.ok(performance.now() - startedAt < 3000, 'finishes within 3 seconds')
    assert.ok(result.suggestions.filter((suggestion) => suggestion.engine === ENGINES.spelling).every((suggestion) => suggestion.confidence === 'low'))
  })

  it('handles text near the length limit quickly', async () => {
    const text = 'they was working on the the report yesterday and i recieve it. '.repeat(75).slice(0, MAX_TEXT_LENGTH)
    const startedAt = performance.now()
    const result = await runPipeline({ text, action: CORRECTION_ACTIONS.fixEverything })
    assert.ok(performance.now() - startedAt < 3000, 'finishes within 3 seconds')
    assert.ok(result.suggestions.length > 75)
  })
})
