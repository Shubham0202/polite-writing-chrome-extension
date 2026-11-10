const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 6

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(value, maximum))

export interface CardAnchor {
  left: number
  top: number
  bottom: number
}

export interface Size {
  width: number
  height: number
}

export interface CardPosition {
  left: number
  top: number
}

// Places the card above the text, so it never covers what the user is about to type; under the text when there is
// no room above, and always inside the viewport.
export const computeCardPosition = (anchor: CardAnchor, card: Size, viewport: Size): CardPosition => {
  const above = anchor.top - ANCHOR_GAP - card.height
  const below = anchor.bottom + ANCHOR_GAP
  const fitsAbove = above >= VIEWPORT_MARGIN
  const fitsBelow = below + card.height + VIEWPORT_MARGIN <= viewport.height

  return {
    left: clamp(anchor.left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - card.width - VIEWPORT_MARGIN)),
    top: clamp(fitsAbove || !fitsBelow ? above : below, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.height - card.height - VIEWPORT_MARGIN)),
  }
}
