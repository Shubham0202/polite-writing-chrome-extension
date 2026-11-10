import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeCardPosition } from './cardPosition.ts'

const CARD = { width: 300, height: 200 }
const VIEWPORT = { width: 1000, height: 800 }
const anchorAt = (left: number, top: number) => ({ left, top, right: left + 50, bottom: top + 20 })

describe('card position', () => {
  it('sits above the text when there is room', () => {
    assert.deepEqual(computeCardPosition(anchorAt(100, 300), CARD, VIEWPORT), { left: 100, top: 94 })
  })

  it('moves under the text near the top of the viewport', () => {
    assert.deepEqual(computeCardPosition(anchorAt(100, 100), CARD, VIEWPORT), { left: 100, top: 126 })
  })

  it('stays inside the right and left edges', () => {
    assert.equal(computeCardPosition(anchorAt(900, 300), CARD, VIEWPORT).left, 692)
    assert.equal(computeCardPosition(anchorAt(-50, 300), CARD, VIEWPORT).left, 8)
  })

  it('stays on screen when neither side has room', () => {
    assert.deepEqual(computeCardPosition(anchorAt(100, 150), { width: 300, height: 600 }, { width: 1000, height: 500 }), { left: 100, top: 8 })
  })
})
