import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyEdits, removeOverlaps } from './diffUtils.js'

const INSERT_SPACE = { offset: 5, length: 0, replacement: ' ' }
const CAPITALIZE = { offset: 5, length: 2, replacement: 'OK' }

describe('diff utils', () => {
  it('applies an insertion and a replacement at the same offset correctly in either order', () => {
    assert.equal(applyEdits('left.Ok.', [INSERT_SPACE, CAPITALIZE]), 'left. OK.')
    assert.equal(applyEdits('left.Ok.', [CAPITALIZE, INSERT_SPACE]), 'left. OK.')
  })

  it('applies edits from the end so earlier offsets stay valid', () => {
    const edits = [
      { offset: 0, length: 1, replacement: 'AA' },
      { offset: 4, length: 1, replacement: 'CC' },
    ]
    assert.equal(applyEdits('a b c', edits), 'AA b CC')
  })

  it('keeps an insertion that touches the edge of a replacement, since the two do not overlap', () => {
    assert.equal(removeOverlaps([CAPITALIZE, INSERT_SPACE], () => 1).length, 2)
  })

  it('keeps the best-ranked of two overlapping edits', () => {
    const weak = { offset: 0, length: 3, replacement: 'x', rank: 2 }
    const strong = { offset: 1, length: 3, replacement: 'y', rank: 1 }
    assert.deepEqual(removeOverlaps([weak, strong], (item) => item.rank), [strong])
  })
})
