/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { ENGINES } from '../constants/corrections.ts'
import { getVisibleBox } from './fieldLocator.ts'
import type { InlineSession } from './inlineSuggestionManager.ts'
import type { SuggestionCardController } from './suggestionCardController.ts'
import { findNearestIndex, findSuggestionAt, getReviewItems, hasReviewItems } from './suggestionState.ts'

const HOVER_OPEN_DELAY_MS = 150
const HOVER_CLOSE_DELAY_MS = 300
const CARET_KEYS = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp'])

export const CARD_SOURCES = Object.freeze({
  hover: 'hover',
  caret: 'caret',
  badge: 'badge',
  keyboard: 'keyboard',
})

export type CardSource = (typeof CARD_SOURCES)[keyof typeof CARD_SOURCES]

// The part of the card controller the openers drive.
export type OpenersCard = Pick<SuggestionCardController, 'open' | 'openAll' | 'close' | 'getOpenItemId' | 'getSource' | 'isListOpen'>

export interface SuggestionOpenersOptions {
  host: Element
  getSession: () => InlineSession
  card: OpenersCard
}

export interface SuggestionOpeners {
  handleMouseMove: (event: MouseEvent) => void
  handleClick: () => void
  handleKeyUp: (event: KeyboardEvent) => void
  handleBadgeClick: () => void
  openFromKeyboard: () => void
  openAllFromKeyboard: () => void
  cancelHover: () => void
  suppress: (id: string | null) => void
}

const isInsideRect = (rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, x: number, y: number) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

// Underlines take no pointer events, so clicks always reach the field; the pointer and caret are compared with them instead.
export const createSuggestionOpeners = ({ host, getSession, card }: SuggestionOpenersOptions): SuggestionOpeners => {
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  let suppressedId: string | null = null

  const cancelHover = () => {
    clearTimeout(hoverTimer!)
    hoverTimer = null
  }

  const findMarkAt = (x: number, y: number) => {
    const { field, clippingAncestors, marks } = getSession()
    const box = getVisibleBox(field, clippingAncestors!)
    if (!box || !isInsideRect(box, x, y)) return null
    return marks?.find(({ rects, suggestion }) => suggestion.engine !== ENGINES.tone && rects.some((rect) => isInsideRect(rect, x, y)))
  }

  const handleMouseMove = (event: MouseEvent) => {
    cancelHover()
    // The list was asked for; a passing pointer must not swap it for a single card.
    if (event.target === host || card.isListOpen()) return

    const mark = event.composedPath().includes(getSession().field) ? findMarkAt(event.clientX, event.clientY) : null
    if (mark && mark.suggestion.id !== card.getOpenItemId()) {
      hoverTimer = setTimeout(() => {
        // A click during the delay may already have opened this card from the caret, which must then stay that way.
        if (mark.suggestion.id !== card.getOpenItemId()) card.open({ items: [mark.suggestion], source: CARD_SOURCES.hover })
      }, HOVER_OPEN_DELAY_MS)
    } else if (!mark && card.getSource() === CARD_SOURCES.hover) {
      hoverTimer = setTimeout(card.close, HOVER_CLOSE_DELAY_MS)
    }
  }

  const handleCaretMove = () => {
    const { locator, state } = getSession()
    // While a notice shows instead of suggestions there is no state and no locator.
    if (!state || card.isListOpen()) return
    const offset = locator!.getCaretOffset()
    const suggestion = offset === null ? undefined : findSuggestionAt(state.corrections, offset)
    if (suggestion && suggestion.id === suppressedId) return
    suppressedId = null

    if (suggestion && suggestion.id !== card.getOpenItemId()) card.open({ items: [suggestion], source: CARD_SOURCES.caret })
    else if (!suggestion && card.getSource() === CARD_SOURCES.caret) card.close()
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    if (CARET_KEYS.has(event.key)) handleCaretMove()
  }

  // Esc keeps a card closed while the arrow keys move through its word, but a click on the word is a clear request.
  const handleClick = () => {
    suppressedId = null
    handleCaretMove()
  }

  const handleBadgeClick = () => {
    const { state } = getSession()
    if (!state) return
    if (card.getSource() === CARD_SOURCES.badge) return card.close()
    card.open({ items: getReviewItems(state), source: CARD_SOURCES.badge })
  }

  const openFromKeyboard = () => {
    const { locator, state } = getSession()
    const items = getReviewItems(state!)
    if (items.length) card.open({ items, index: findNearestIndex(items, locator!.getCaretOffset()), source: CARD_SOURCES.keyboard, moveFocus: true })
  }

  // Pressed again, the shortcut puts the list away.
  const openAllFromKeyboard = () => {
    if (card.isListOpen()) return card.close()
    if (hasReviewItems(getSession().state!)) card.openAll({ source: CARD_SOURCES.keyboard, moveFocus: true })
  }

  return {
    handleMouseMove,
    handleClick,
    handleKeyUp,
    handleBadgeClick,
    openFromKeyboard,
    openAllFromKeyboard,
    cancelHover,
    suppress: (id: string | null) => {
      suppressedId = id
    },
  }
}
