import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CORRECT_SENTENCES } from '../../fixtures/sentences.js'
import { applyDefaultSuggestions } from '../suggestion.js'
import { checkTense } from './tenseEngine.js'
import { TENSE_RULES } from './tenseRules.js'

const fixTense = (text) => applyDefaultSuggestions(text, checkTense(text))

describe('tense engine', () => {
  for (const rule of TENSE_RULES) {
    describe(rule.id, () => {
      for (const { incorrect, correct } of rule.examples) {
        it(`"${incorrect}" → "${correct}"`, () => assert.equal(fixTense(incorrect), correct))
      }
    })
  }

  it('offers "be + -ing" as a second option after a modal', () => {
    const [suggestion] = checkTense('I will coming tomorrow.')
    assert.deepEqual(suggestion.replacements, ['come', 'be coming'])
  })

  it('fixes the time-based tense even when the sentence contains another verb error', () => {
    assert.equal(fixTense("Yesterday I go to the office and he don't came."), "Yesterday I went to the office and he don't come.")
  })

  it('handles curly apostrophes', () => {
    assert.equal(fixTense('I didn’t went.'), 'I didn’t go.')
  })

  it('leaves correct sentences untouched', () => {
    for (const sentence of CORRECT_SENTENCES) {
      assert.deepEqual(checkTense(sentence), [], sentence)
    }
  })

  it('does not touch names, nouns or habits that look like errors', () => {
    for (const text of [
      'Will tested the build.',
      'The trash can smelled.',
      'Our it support team is great.',
      'I work every day, and yesterday was no different.',
      'We did tests yesterday.',
      'Have you got a minute?',
    ]) {
      assert.deepEqual(checkTense(text), [], text)
    }
  })
})
