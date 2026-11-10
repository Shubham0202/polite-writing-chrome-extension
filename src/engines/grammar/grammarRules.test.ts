import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CORRECT_SENTENCES } from '../../fixtures/sentences.ts'
import { applyDefaultSuggestions } from '../suggestion.ts'
import { checkGrammarRules } from './grammarRules.ts'

const fixGrammar = (text: string): string => applyDefaultSuggestions(text, checkGrammarRules(text))

describe('local grammar rules', () => {
  for (const [incorrect, correct] of [
    ["He don't know.", "He doesn't know."],
    ['She do not care.', 'She does not care.'],
    ["i doesn't know.", "I don't know."],
    ['They was working.', 'They were working.'],
    ['He are late.', 'He is late.'],
    ['i is ready.', 'I am ready.'],
    ['We is ready.', 'We are ready.'],
    ['You should of called.', 'You should have called.'],
    ['It was a easy fix.', 'It was an easy fix.'],
    ['can you check the current ticket info', 'Can you check the current ticket info?'],
    ['Could you send it.', 'Could you send it?'],
    ['sir i am not able to complete this task', 'Sir, I am not able to complete this task.'],
    ['Thanks , see you soon.', 'Thanks, see you soon.'],
    ['Hi,how are you?', 'Hi, how are you?'],
    ['Please  send it.', 'Please send it.'],
    ['I sent the the file.', 'I sent the file.'],
    ['the build passed. the tests failed.', 'The build passed. The tests failed.'],
    ["yesterday i'm sure i saw it.", "Yesterday I'm sure I saw it."],
    ['they was late', 'They were late'],
    ['He don’t know.', 'He doesn’t know.'],
    ['I am suppose to finish today.', 'I am supposed to finish today.'],
    ["I'm not use to it.", "I'm not used to it."],
    ['I am really worry about it.', 'I am really worried about it.'],
    ['Send it.Thanks', 'Send it. Thanks'],
    ['I said no. then he left.', 'I said no. Then he left.'],
  ]) {
    it(`"${incorrect}" → "${correct}"`, () => assert.equal(fixGrammar(incorrect), correct))
  }

  it('keeps words that only look like the pronoun i or an article', () => {
    for (const text of [
      'Use i.e. and e.g. carefully.',
      'It was a user error.',
      'It was a one-time fix.',
      'A European team joined.',
      'Option a is better than option b.',
      'Plan a or plan b.',
      'Make a u-turn.',
    ]) {
      assert.equal(fixGrammar(text), text)
    }
  })

  it('keeps intentional repeats and names', () => {
    for (const text of ['We went to Bora Bora.', 'Bye bye.', 'No no, that is fine.']) {
      assert.equal(fixGrammar(text), text)
    }
  })

  it('does not add a question mark after a lead-in or trailing-off question', () => {
    for (const text of ['Can you check the following:', 'Could you review the doc…', 'Can you check these...']) {
      assert.equal(fixGrammar(text), text)
    }
  })

  it('does not touch words that are also Object members', () => {
    assert.equal(fixGrammar('The constructor work fine.'), 'The constructor work fine.')
  })

  it('does not add a period to short lines, list items or greetings', () => {
    const text = 'Hi team\n\n- update the docs\n\nRegards\nRaj'
    assert.equal(fixGrammar(text), text)
  })

  it('does not capitalize the word after an abbreviation', () => {
    for (const text of ['The U.S. delegation followed.', 'Contact Acme Inc. today.', 'Bring pens, paper etc. and a chair.']) {
      assert.equal(fixGrammar(text), text)
    }
  })

  it('does not capitalize URLs or emails at the start of a sentence', () => {
    const text = 'www.example.com is down. support@example.com replied.'
    assert.equal(fixGrammar(text), text)
  })

  it('leaves correct sentences untouched', () => {
    for (const sentence of CORRECT_SENTENCES) {
      assert.equal(fixGrammar(sentence), sentence)
    }
  })
})
