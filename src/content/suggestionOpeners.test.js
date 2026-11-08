import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSuggestionOpeners } from './suggestionOpeners.js'

const createCard = () => {
  const calls = []
  return {
    calls,
    open: (options) => calls.push(['open', options]),
    close: () => calls.push(['close']),
    getOpenItemId: () => null,
    getSource: () => null,
    isListOpen: () => false,
  }
}

const CORRECTION = { id: 'spelling-0', engine: 'spelling', offset: 2, length: 7, original: 'recieve', replacements: ['receive'] }
const STATE = { text: 'i recieve it', corrections: [CORRECTION], toneAlternatives: { polite: [], professional: [] } }
// While the "!" notice is showing, tracking is on but there is nothing to open: no state and no locator.
const NOTICE_SESSION = { field: {}, state: null, locator: null, clippingAncestors: [], marks: null }

const createOpeners = (session, card) => createSuggestionOpeners({ host: {}, getSession: () => session, card })

describe('suggestion openers', () => {
  it('ignores keys, clicks and the badge while a notice is showing instead of suggestions', () => {
    const card = createCard()
    const openers = createOpeners(NOTICE_SESSION, card)
    openers.handleKeyUp({ key: 'ArrowLeft' })
    openers.handleClick()
    openers.handleBadgeClick()
    assert.deepEqual(card.calls, [])
  })

  it('opens the card from the caret and from the badge when there are suggestions', () => {
    const card = createCard()
    const openers = createOpeners({ ...NOTICE_SESSION, state: STATE, locator: { getCaretOffset: () => 4 } }, card)
    openers.handleKeyUp({ key: 'ArrowRight' })
    openers.handleBadgeClick()
    assert.deepEqual(
      card.calls.map(([name, options]) => [name, options.source, options.items.length]),
      [
        ['open', 'caret', 1],
        ['open', 'badge', 1],
      ],
    )
  })
})
