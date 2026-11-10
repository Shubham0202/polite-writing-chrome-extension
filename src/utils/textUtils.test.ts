import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { splitSentences } from './textUtils.ts'

const sentenceTexts = (text: string) => splitSentences(text).map((sentence) => sentence.text)

describe('text utils', () => {
  it('splits sentences at terminal punctuation and line breaks', () => {
    assert.deepEqual(sentenceTexts('One. Two!\nThree'), ['One.', 'Two!', 'Three'])
  })

  it('does not end a sentence at an abbreviation or a dotted initialism', () => {
    for (const text of [
      'Dr. Smith arrived at 5 p.m. and the U.S. delegation followed.',
      'We need pens, paper etc. and then we leave.',
      'Acme Inc. hired her last week.',
      'See fig. 3 for the result.',
    ]) {
      assert.deepEqual(sentenceTexts(text), [text], text)
    }
  })

  it('still ends a sentence at a period that only looks like an abbreviation', () => {
    assert.deepEqual(sentenceTexts('I said no. Then I left.'), ['I said no.', 'Then I left.'])
    assert.deepEqual(sentenceTexts('Ask question No. 5 again.'), ['Ask question No. 5 again.'])
  })
})
