import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getNavigationTarget } from './cardNavigation.ts'

// The list: the AI switch, the Regenerate row, then two suggestions with Accept and Dismiss, the second with Ignore too.
const ROW_SIZES = [1, 1, 2, 3]
const from = (row: number, column: number, key: string) => getNavigationTarget({ rowSizes: ROW_SIZES, row, column, key })

describe('card navigation', () => {
  it('moves down and up between rows, always landing on Accept', () => {
    assert.deepEqual(from(2, 1, 'ArrowDown'), { row: 3, column: 0 })
    assert.deepEqual(from(3, 2, 'ArrowUp'), { row: 2, column: 0 })
    assert.deepEqual(from(2, 0, 'PageDown'), { row: 3, column: 0 })
    assert.deepEqual(from(3, 0, 'PageUp'), { row: 2, column: 0 })
  })

  it('moves along a row to Dismiss and Ignore and back', () => {
    assert.deepEqual(from(3, 0, 'ArrowRight'), { row: 3, column: 1 })
    assert.deepEqual(from(3, 1, 'ArrowRight'), { row: 3, column: 2 })
    assert.deepEqual(from(3, 2, 'ArrowLeft'), { row: 3, column: 1 })
  })

  it('stops at the edges instead of wrapping', () => {
    assert.deepEqual(from(0, 0, 'ArrowUp'), { row: 0, column: 0 })
    assert.deepEqual(from(3, 0, 'ArrowDown'), { row: 3, column: 0 })
    assert.deepEqual(from(2, 0, 'ArrowLeft'), { row: 2, column: 0 })
    assert.deepEqual(from(2, 1, 'ArrowRight'), { row: 2, column: 1 })
  })

  it('leaves every other key alone', () => {
    for (const key of ['Enter', ' ', 'Tab', 'Home', 'a', 'constructor']) assert.equal(from(2, 0, key), null, key)
  })
})
