import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import dictionary from 'dictionary-en'
import { CONFIDENCE } from '../../constants/corrections.js'
import { CORRECT_SENTENCES } from '../../fixtures/sentences.js'
import { createSpellChecker } from './spellChecker.js'

const spellCheck = createSpellChecker(dictionary)
const checkSpelling = (text, options) => spellCheck(text, options).suggestions

describe('spell checker', () => {
  for (const [misspelled, expected] of [
    ['recieve', 'receive'],
    ['definately', 'definitely'],
    ['seperate', 'separate'],
    ['becuase', 'because'],
    ['acheive', 'achieve'],
    ['thier', 'their'],
    ['teh', 'the'],
    ['dont', "don't"],
  ]) {
    it(`suggests "${expected}" first for "${misspelled}"`, () => {
      const [suggestion] = checkSpelling(`I ${misspelled} it.`)
      assert.equal(suggestion.original, misspelled)
      assert.equal(suggestion.replacements[0], expected)
      assert.equal(suggestion.offset, 2)
      assert.equal(suggestion.confidence, CONFIDENCE.high)
    })
  }

  for (const [regularized, past] of [
    ['buyed', 'bought'],
    ['goed', 'went'],
    ['teached', 'taught'],
    ['runned', 'ran'],
  ]) {
    it(`corrects "${regularized}" to the real past tense "${past}"`, () => {
      const [suggestion] = checkSpelling(`I ${regularized} it.`)
      assert.deepEqual(suggestion.replacements, [past])
      assert.equal(suggestion.confidence, CONFIDENCE.high)
    })
  }

  it('does not pre-apply a two-edit guess for a short word, which is usually a name', () => {
    const [suggestion] = checkSpelling('i told aniket about it.')
    assert.equal(suggestion.original, 'aniket')
    assert.equal(suggestion.confidence, CONFIDENCE.low)
  })

  it('treats the word after a greeting as a name, whatever the guess', () => {
    assert.equal(checkSpelling('tomorow is a holiday')[0].confidence, CONFIDENCE.high)
    assert.equal(checkSpelling('hey tomorow is a holiday')[0].confidence, CONFIDENCE.low)
  })

  it('keeps the capitalization of the misspelled word', () => {
    const [suggestion] = checkSpelling('Recieve the file.')
    assert.equal(suggestion.replacements[0], 'Receive')
  })

  it('skips ignored words, identifiers, proper nouns, URLs, emails and code', () => {
    const text = 'Ask Rajkumar about the EOD WriteBetter build at https://exmple.com or raj@exmple.com, run `npm ci`, then recieve it.'
    assert.deepEqual(
      checkSpelling(text).map((suggestion) => suggestion.original),
      ['recieve'],
    )
    assert.equal(checkSpelling('I recieve it.', { ignoredWords: ['Recieve'] }).length, 0)
  })

  it('treats words that are also Object members as ordinary words', () => {
    assert.deepEqual(checkSpelling('The constructor and the __proto__ value work.'), [])
    assert.deepEqual(checkSpelling('constructor toString valueOf hasOwnProperty'), [])
  })

  it('accepts accented and British spellings', () => {
    assert.deepEqual(checkSpelling('The café has a naïve résumé.'), [])
    assert.deepEqual(checkSpelling('The colour of the organisation centre travelled through the programme catalogue.'), [])
  })

  it('never pre-applies a guess for a capitalized name or a distant word', () => {
    const [name] = checkSpelling('Rajesh will join the call.')
    if (name) assert.equal(name.confidence, CONFIDENCE.low)

    for (const suggestion of checkSpelling('kal mai office nahi aaunga kyunki tabiyat kharab hai')) {
      assert.equal(suggestion.confidence, CONFIDENCE.low, suggestion.original)
      const unrelatedProperNouns = suggestion.replacements.filter(
        (replacement) => /^\p{Lu}/u.test(replacement) && replacement.toLowerCase() !== suggestion.original,
      )
      assert.deepEqual(unrelatedProperNouns, [], `no unrelated proper noun for ${suggestion.original}`)
    }
  })

  it('stops within its time budget on long text full of unknown words', () => {
    const text = Array.from({ length: 700 }, (_, index) => `qzx${'abcdefghijklmnop'.slice(index % 7, (index % 7) + 4 + (index % 5))}`).join(' ')
    const startedAt = performance.now()
    const { isComplete } = createSpellChecker(dictionary)(text.slice(0, 5000))
    assert.ok(performance.now() - startedAt < 2500, 'finishes in about the 1.5 s budget')
    assert.equal(isComplete, false)
  })

  it('leaves correct sentences untouched', () => {
    for (const sentence of CORRECT_SENTENCES) {
      assert.deepEqual(checkSpelling(sentence), [], sentence)
    }
  })
})
