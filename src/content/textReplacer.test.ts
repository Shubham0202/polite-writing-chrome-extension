import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AtomRange } from './fieldText.ts'
import { isSameText, narrowToChange, shiftCaret, splitAroundAtoms } from './textReplacer.ts'

describe('caret after a replacement', () => {
  it('stays put before the change', () => {
    assert.equal(shiftCaret(2, 5, 10, 3), 2)
    assert.equal(shiftCaret(5, 5, 10, 3), 5)
  })

  it('moves with the text after the change', () => {
    assert.equal(shiftCaret(10, 5, 10, 3), 8)
    assert.equal(shiftCaret(20, 5, 10, 8), 23)
  })

  it('lands after the replacement when it was inside the replaced text', () => {
    assert.equal(shiftCaret(7, 5, 10, 3), 8)
  })

  it('moves past text inserted at the caret, so typing carries on after it', () => {
    assert.equal(shiftCaret(5, 5, 5, 1), 6)
  })

  it('leaves an unknown caret unknown', () => {
    assert.equal(shiftCaret(null, 5, 10, 3), null)
  })
})

describe('edits across emoji images and mentions', () => {
  const TEXT = 'thanks for the update 🙂 can you send the file'
  const EMOJI: AtomRange = [22, 24]

  it('keeps an edit without them whole', () => {
    assert.deepEqual(splitAroundAtoms('send it', [], 0, 7, 'Please send it.'), [{ start: 0, end: 7, replacement: 'Please send it.' }])
    assert.deepEqual(splitAroundAtoms(TEXT, [EMOJI], 0, 6, 'Thanks'), [{ start: 0, end: 6, replacement: 'Thanks' }])
  })

  it('edits only the text around an emoji the rewrite kept, and skips what stayed the same', () => {
    assert.deepEqual(splitAroundAtoms(TEXT, [EMOJI], 0, TEXT.length, 'Thanks for the update 🙂. Could you send me the file, please?'), [
      { start: 0, end: 22, replacement: 'Thanks for the update ' },
      { start: 24, end: TEXT.length, replacement: '. Could you send me the file, please?' },
    ])
    assert.deepEqual(splitAroundAtoms(TEXT, [EMOJI], 0, TEXT.length, 'thanks for the update 🙂 can you send the file, please?'), [
      { start: 24, end: TEXT.length, replacement: ' can you send the file, please?' },
    ])
  })

  it('handles several of them, and text moved from one side of them to the other', () => {
    const text = 'hey @Shubham 🙂 send it'
    const atoms: AtomRange[] = [[4, 12], [13, 15]]
    assert.deepEqual(splitAroundAtoms(text, atoms, 0, text.length, 'Hi @Shubham, 🙂 please send it.'), [
      { start: 0, end: 4, replacement: 'Hi ' },
      { start: 12, end: 13, replacement: ', ' },
      { start: 15, end: text.length, replacement: ' please send it.' },
    ])
  })

  it('finds a mention by what it shows, without the invisible characters Jira keeps inside it', () => {
    const text = '​@sachin.dhokale​ this is for testing'
    assert.deepEqual(splitAroundAtoms(text, [[0, 17]], 0, text.length, '@sachin.dhokale This is for testing.'), [
      { start: 17, end: text.length, replacement: ' This is for testing.' },
    ])
  })

  it('refuses a rewrite that drops one, or a span that cuts through one', () => {
    assert.equal(splitAroundAtoms(TEXT, [EMOJI], 0, TEXT.length, 'Thanks for the update. Could you send the file?'), null)
    assert.equal(splitAroundAtoms(TEXT, [EMOJI], 23, TEXT.length, 'x'), null)
  })

  it('refuses to place one that shows nothing, since the rewrite cannot say where it goes', () => {
    assert.equal(splitAroundAtoms('a​b', [[1, 2]], 0, 3, 'A b'), null)
  })

  it('has nothing to do when the replacement changes nothing, a non-breaking space included', () => {
    assert.deepEqual(splitAroundAtoms(TEXT, [EMOJI], 0, TEXT.length, TEXT), [])
    const browserText = TEXT.replace('update ', 'update\u00A0')
    assert.deepEqual(splitAroundAtoms(browserText, [EMOJI], 0, TEXT.length, TEXT.replace('file', 'files')), [{ start: 24, end: TEXT.length, replacement: ' can you send the files' }])
  })
})

describe('narrowing an edit to what changes', () => {
  it('leaves out a line break both sides end with, which rich text cannot select', () => {
    const text = 'this is for testing\n'
    assert.deepEqual(narrowToChange(text, { start: 0, end: text.length, replacement: 'This is for testing.\n' }), {
      start: 0,
      end: 19,
      replacement: 'This is for testing.',
    })
  })

  it('keeps only the changed characters of a word', () => {
    assert.deepEqual(narrowToChange('send the fiel now', { start: 9, end: 13, replacement: 'file' }), { start: 11, end: 13, replacement: 'le' })
  })

  it('keeps an insertion and a deletion as they are', () => {
    assert.deepEqual(narrowToChange('send it', { start: 7, end: 7, replacement: '.' }), { start: 7, end: 7, replacement: '.' })
    assert.deepEqual(narrowToChange('send it it', { start: 7, end: 10, replacement: '' }), { start: 7, end: 10, replacement: '' })
  })
})

describe('comparing the text an edit left behind', () => {
  it('ignores non-breaking spaces and the invisible characters editors keep next to mentions', () => {
    assert.equal(isSameText('Hi\u00A0there', 'Hi there'), true)
    assert.equal(isSameText('@Shubham Chandgude\u200B, how are you?', '@Shubham Chandgude, how are you?'), true)
    assert.equal(isSameText('\uFEFFhi\u2060', 'hi'), true)
  })

  it('still sees every visible difference', () => {
    assert.equal(isSameText('Hi there', 'Hi  there'), false)
    assert.equal(isSameText('Hi there', 'Hi there.'), false)
    assert.equal(isSameText('hi', 'Hi'), false)
  })
})
