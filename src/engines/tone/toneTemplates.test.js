import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TONES } from '../../constants/corrections.js'
import { applyDefaultSuggestions } from '../suggestion.js'
import { checkTone, toTemplateKey } from './toneEngine.js'
import * as TEMPLATE_CATEGORIES from './toneTemplates.js'
import { POLITE_TEMPLATES } from './politeRules.js'

const rewrite = (text, tone) => applyDefaultSuggestions(text, checkTone(text, tone))
const ALL_TEMPLATES = Object.values(TEMPLATE_CATEGORIES).flatMap((category) => Object.entries(category))
const PROFESSIONAL_ONLY = [
  TEMPLATE_CATEGORIES.WORKPLACE_QUESTION_TEMPLATES,
  TEMPLATE_CATEGORIES.DEVELOPMENT_TEMPLATES,
  TEMPLATE_CATEGORIES.ACKNOWLEDGEMENT_TEMPLATES,
].flatMap((category) => Object.entries(category))

describe('tone template data', () => {
  it('never maps the same normalized phrase to two different rewrites', () => {
    const rewrites = new Map()
    for (const [key, replacement] of ALL_TEMPLATES) {
      const normalizedKey = toTemplateKey(key)
      assert.ok(!rewrites.has(normalizedKey) || rewrites.get(normalizedKey) === replacement, `conflicting templates for "${key}"`)
      rewrites.set(normalizedKey, replacement)
    }
  })

  it('has well-formed rewrites', () => {
    for (const [key, replacement] of ALL_TEMPLATES) {
      assert.match(replacement, /^[A-Z].*[.?!]$/, key)
      assert.doesNotMatch(replacement, /\s{2}|\b(\w+)\s+\1\b/i, key)
      assert.notEqual(toTemplateKey(replacement), toTemplateKey(key), `"${key}" rewrites to itself`)
    }
  })

  it('rewrites every polite template phrase when typed as a sentence', () => {
    for (const [key, replacement] of Object.entries(POLITE_TEMPLATES)) {
      assert.equal(rewrite(`${key}.`, TONES.polite), replacement, key)
      assert.equal(rewrite(`${key}.`, TONES.professional), replacement, key)
    }
  })

  it('applies professional-only templates in the professional tone only', () => {
    for (const [key, replacement] of PROFESSIONAL_ONLY) {
      assert.equal(rewrite(`${key}.`, TONES.professional), replacement, key)
      assert.notEqual(rewrite(`${key}.`, TONES.polite), replacement, key)
    }
  })

  it('matches however the phrase is typed', () => {
    for (const typed of ["I don't understand!", 'i dont understand', 'I do not understand.', 'I DON’T UNDERSTAND']) {
      assert.equal(rewrite(typed, TONES.polite), 'Could you please clarify this for me?', typed)
    }
    assert.equal(rewrite("Let's discuss this.", TONES.polite), 'Could we schedule some time to discuss this?')
    assert.equal(rewrite('Lets discuss this', TONES.polite), 'Could we schedule some time to discuss this?')
    assert.equal(rewrite('Fix this issue please', TONES.polite), 'Could you please look into this issue?')
  })

  it('keeps the greeting and does not run phrase rules over curated wording', () => {
    assert.equal(rewrite('Hi team, any progress?', TONES.professional), 'Hello team, could you please share any progress on this?')
    assert.equal(rewrite('Are you sure?', TONES.professional), 'Could you please double-check this?')
  })
})

describe('tone pattern templates', () => {
  for (const [input, expected] of [
    ['You need to update the API by Friday.', 'Could you please update the API by Friday?'],
    ['You must submit the form today, please.', 'Could you please submit the form today?'],
    ['I want you to review PR #42.', 'Could you please review PR #42?'],
    ['Please check this now.', 'Could you please check this as soon as possible?'],
    ["Why didn't you test this?", 'Was there a reason you were not able to test this?'],
    ['Why are you delaying the release?', 'Could you help me understand why you are delaying the release?'],
    ['You should have informed me.', 'It would have been helpful if you had informed me.'],
    ['This is not correct.', 'This does not appear to be correct.'],
    ["It isn't working on Safari.", 'It does not appear to be working on Safari.'],
  ]) {
    it(`"${input}" → "${expected}"`, () => assert.equal(rewrite(input, TONES.polite), expected))
  }

  it('leaves figures of speech and neutral statements alone', () => {
    for (const text of ['You have to understand the risk.', 'This is not my first project.', 'It is not raining.']) {
      assert.deepEqual(checkTone(text, TONES.polite), [], text)
    }
  })
})
