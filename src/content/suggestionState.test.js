import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TONES } from '../constants/corrections.js'
import {
  createSuggestionState,
  excludeDismissed,
  findNearestIndex,
  findRewrite,
  findSuggestionAt,
  getDisplaySpan,
  getListItems,
  getReviewItems,
  getSuggestionKey,
  rebaseSuggestionState,
} from './suggestionState.js'

const TEXT = 'i recieve it. send me the file'
const CORRECTION = { id: 'spelling-0', engine: 'spelling', offset: 2, length: 7, original: 'recieve', replacements: ['receive'] }
const POLITE = { id: 'polite-0', engine: 'tone', offset: 14, length: 16, original: 'send me the file', replacements: ['Could you send the file?'] }
const SENTENCE = { id: 'professional-0', engine: 'tone', offset: 0, length: 13, original: 'i recieve it.', replacements: ['I received it.'] }
const AI_REWRITE = { id: 'rewrite-0', engine: 'rewrite', offset: 14, length: 16, original: 'send me the file', replacements: ['Please send me the file.'] }

const createState = (corrections = [CORRECTION]) =>
  createSuggestionState({
    original: TEXT,
    suggestions: corrections,
    toneAlternatives: { [TONES.polite]: [POLITE], [TONES.professional]: [SENTENCE] },
  })

describe('suggestion state', () => {
  it('moves corrections and rewrites together through an edit', () => {
    const state = rebaseSuggestionState(createState(), `oh ${TEXT}`)
    assert.equal(state.text, `oh ${TEXT}`)
    assert.equal(state.corrections[0].offset, 5)
    assert.equal(state.toneAlternatives[TONES.polite][0].offset, 17)
  })

  it('removes dismissed suggestions and keeps the rest', () => {
    const state = excludeDismissed(createState(), new Set([getSuggestionKey(CORRECTION), getSuggestionKey(POLITE)]))
    assert.deepEqual(state.corrections, [])
    assert.deepEqual(state.toneAlternatives[TONES.polite], [])
    assert.deepEqual(state.toneAlternatives[TONES.professional], [SENTENCE])
    assert.equal(state.text, TEXT)
  })

  it('recognises a dismissed suggestion wherever the text has moved it', () => {
    const moved = rebaseSuggestionState(createState(), `oh ${TEXT}`)
    assert.deepEqual(excludeDismissed(moved, new Set([getSuggestionKey(CORRECTION)])).corrections, [])
  })

  it('keeps everything when nothing was dismissed', () => {
    assert.deepEqual(excludeDismissed(createState(), undefined).corrections, [CORRECTION])
  })

  it('underlines the text of a suggestion, and the neighbouring character of an insertion', () => {
    assert.deepEqual(getDisplaySpan(CORRECTION, TEXT), [2, 9])
    assert.deepEqual(getDisplaySpan({ offset: 5, length: 0 }, 'hello'), [4, 5])
    assert.deepEqual(getDisplaySpan({ offset: 0, length: 0 }, 'hello'), [0, 1])
    assert.deepEqual(getDisplaySpan({ offset: 0, length: 0 }, ''), [0, 0])
  })

  it('finds a suggestion only when the caret is inside it', () => {
    assert.equal(findSuggestionAt([CORRECTION], 5), CORRECTION)
    assert.equal(findSuggestionAt([CORRECTION], 2), undefined)
    assert.equal(findSuggestionAt([CORRECTION], 9), undefined)
  })

  it('finds the rewrite of the sentence around a correction', () => {
    const { toneAlternatives } = createState()
    assert.equal(findRewrite(toneAlternatives, CORRECTION, TONES.professional), SENTENCE)
    assert.equal(findRewrite(toneAlternatives, CORRECTION, TONES.polite), undefined)
  })

  it('reviews corrections and the sentences without mistakes, in text order', () => {
    assert.deepEqual(getReviewItems(createState()), [CORRECTION, POLITE])
    assert.deepEqual(getReviewItems(createState([])), [SENTENCE, POLITE])
  })

  it('starts without AI rewrites, and lists them with the other items once they arrive', () => {
    assert.deepEqual(createState().aiRewrites, [])
    const state = createSuggestionState({ original: TEXT, suggestions: [CORRECTION], toneAlternatives: { [TONES.polite]: [], [TONES.professional]: [] }, aiRewrites: [AI_REWRITE] })
    assert.deepEqual(getReviewItems(state), [CORRECTION, AI_REWRITE])
  })

  it('lists AI rewrites first, in text order, and keeps text order for the badge', () => {
    const early = { ...AI_REWRITE, id: 'rewrite-1', offset: 0, length: 13, original: 'i recieve it.', replacements: ['I received it.'] }
    const state = createSuggestionState({
      original: TEXT,
      suggestions: [CORRECTION],
      toneAlternatives: { [TONES.polite]: [POLITE], [TONES.professional]: [] },
      aiRewrites: [AI_REWRITE, early],
    })
    assert.deepEqual(getListItems(state), [early, AI_REWRITE, CORRECTION, POLITE])
    // At the same offset, text order keeps the local rewrite ahead of the AI one, as it always has.
    assert.deepEqual(getReviewItems(state), [early, CORRECTION, POLITE, AI_REWRITE])
    assert.deepEqual(getListItems(createState()), getReviewItems(createState()))
  })

  it('moves and dismisses AI rewrites like the other suggestions', () => {
    const state = createSuggestionState({ original: TEXT, suggestions: [], toneAlternatives: { [TONES.polite]: [], [TONES.professional]: [] }, aiRewrites: [AI_REWRITE] })
    assert.equal(rebaseSuggestionState(state, `oh ${TEXT}`).aiRewrites[0].offset, 17)
    assert.deepEqual(excludeDismissed(state, new Set([getSuggestionKey(AI_REWRITE)])).aiRewrites, [])
  })

  it('lists a sentence once when both tones can rewrite it', () => {
    const state = createSuggestionState({
      original: TEXT,
      suggestions: [],
      toneAlternatives: { [TONES.polite]: [POLITE], [TONES.professional]: [{ ...POLITE, id: 'professional-0' }] },
    })
    assert.equal(getReviewItems(state).length, 1)
  })

  it('picks the item at or after the caret, wrapping to the first', () => {
    const items = [{ offset: 2, length: 3 }, { offset: 20, length: 3 }]
    assert.equal(findNearestIndex(items, 0), 0)
    assert.equal(findNearestIndex(items, 10), 1)
    assert.equal(findNearestIndex(items, 40), 0)
    assert.equal(findNearestIndex(items, null), 0)
  })
})
