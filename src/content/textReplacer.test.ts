import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findEditablePositions, type AtomRange, type EditableTextMap } from './fieldText.ts'
import { isSameText, narrowToChange, shiftCaret, splitAroundAtoms, widenToTextNodes, type EditRange } from './textReplacer.ts'

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

describe('moving an edit off a line break that has no text node', () => {
  // One text node per line, as paragraphs or <br> leave them: the line breaks between them belong to no node.
  const toTextMap = (lines: string[]): EditableTextMap => {
    let start = 0
    const textNodes = lines.flatMap((line) => {
      const entry = line ? [{ node: { nodeValue: line } as Text, start }] : []
      start += line.length + 1
      return entry
    })
    return { text: lines.join('\n'), textNodes, atoms: [] }
  }
  const apply = (text: string, { start, end, replacement }: EditRange) => text.slice(0, start) + replacement + text.slice(end)
  const widenRewrite = (textMap: EditableTextMap, rewritten: string) => widenToTextNodes(textMap, narrowToChange(textMap.text, { start: 0, end: textMap.text.length, replacement: rewritten }))

  it('takes in the character before a change that starts on a line break, so the edit can be selected', () => {
    const textMap = toTextMap(['Hi team', 'the build is passed'])
    const rewritten = 'Hi team,\nThe build has passed.'
    assert.equal(findEditablePositions(textMap, 7, 27), null, 'the narrowed change alone starts on the line break')

    const edit = widenRewrite(textMap, rewritten)
    assert.deepEqual(edit, { start: 6, end: 27, replacement: 'm,\nThe build has passed.' })
    assert.ok(findEditablePositions(textMap, edit.start, edit.end))
    assert.equal(apply(textMap.text, edit), rewritten)
  })

  it('crosses an empty line, and takes in the character after a change that ends on a line break', () => {
    for (const [lines, rewritten] of [
      [['Hello', '', 'world'], 'Hello\nWorld'],
      [['Hi team', 'please check'], 'Hi team, please check'],
    ] satisfies Array<[string[], string]>) {
      const textMap = toTextMap(lines)
      const edit = widenRewrite(textMap, rewritten)
      assert.ok(findEditablePositions(textMap, edit.start, edit.end), rewritten)
      assert.equal(apply(textMap.text, edit), rewritten)
    }
  })

  it('leaves an edit inside text, and an insertion, as they are', () => {
    const textMap = toTextMap(['hi team', 'the build'])
    for (const edit of [
      { start: 0, end: 1, replacement: 'H' },
      { start: 7, end: 7, replacement: ',' },
    ]) {
      assert.deepEqual(widenToTextNodes(textMap, edit), edit)
    }
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
