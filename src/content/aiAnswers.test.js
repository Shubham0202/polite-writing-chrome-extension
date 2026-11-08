import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAiAnswer, describeAiAnswer, followCardChange, isAnswerFor } from './aiAnswers.js'

const TEXT = 'hey can i get the file'
const ACCEPTED = 'Hi, could I get the file?'
const RESULT = { suggestions: [{ id: 'rewrite-0', offset: 0, length: TEXT.length }], engines: [{ label: 'AI rewrite (Groq)', message: null }] }

describe('AI answers', () => {
  it('answers the same text in the same style from memory, and nothing else', () => {
    const answer = createAiAnswer({ text: TEXT, style: 'polite', result: RESULT })
    assert.equal(isAnswerFor(answer, { text: TEXT, style: 'polite' }), true)
    assert.equal(isAnswerFor(answer, { text: `${TEXT}s`, style: 'polite' }), false)
    assert.equal(isAnswerFor(answer, { text: TEXT, style: 'concise' }), false)
    assert.equal(isAnswerFor(undefined, { text: TEXT, style: 'polite' }), false)
  })

  it('keeps describing the text after a change made on the card, including the way back by Undo', () => {
    const answer = followCardChange(createAiAnswer({ text: TEXT, style: 'polite', result: RESULT }), TEXT, ACCEPTED)
    assert.equal(isAnswerFor(answer, { text: ACCEPTED, style: 'polite' }), true)
    assert.equal(isAnswerFor(answer, { text: TEXT, style: 'polite' }), true)
  })

  it('does not adopt a change made to text the answer no longer described', () => {
    const answer = createAiAnswer({ text: TEXT, style: 'polite', result: RESULT })
    const typed = `${TEXT} now`
    assert.equal(followCardChange(answer, typed, `${typed}.`), answer)
    assert.equal(isAnswerFor(answer, { text: `${typed}.`, style: 'polite' }), false)
    assert.equal(followCardChange(undefined, TEXT, ACCEPTED), undefined)
  })

  it('keeps the notice the AI gave, such as nothing to improve', () => {
    const answer = createAiAnswer({ text: TEXT, style: 'polite', result: { suggestions: [], engines: [{ message: 'The AI found nothing to improve.' }] } })
    assert.equal(answer.message, 'The AI found nothing to improve.')
    assert.equal(createAiAnswer({ text: TEXT, style: 'polite', result: { suggestions: [] } }).message, null)
  })

  it('says whether the answer is new or from earlier, and when nothing of it is left', () => {
    assert.equal(describeAiAnswer({ isEarlier: false, visibleCount: 2, message: null }), 'AI rewrite ready.')
    assert.equal(describeAiAnswer({ isEarlier: true, visibleCount: 2, message: null }), 'Showing the earlier AI rewrite of this text.')
    assert.equal(describeAiAnswer({ isEarlier: false, visibleCount: 0, message: null }), 'No AI changes left to review.')
    assert.equal(describeAiAnswer({ isEarlier: true, visibleCount: 0, message: 'Nothing to improve.' }), 'Showing the earlier AI rewrite of this text. Nothing to improve.')
    assert.equal(describeAiAnswer({ isEarlier: false, visibleCount: 1, message: 'Check the numbers.' }), 'Check the numbers.')
  })
})
