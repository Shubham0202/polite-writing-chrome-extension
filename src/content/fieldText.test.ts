import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIELD_KINDS } from './fieldEligibility.ts'
import { findEditableCaret, findEditableOffset, findEditablePositions, mapEditableText, readFieldText } from './fieldText.ts'

// Node has no DOM; these stand-ins carry only what the reader looks at.
const mutableGlobal: { Node?: unknown } = globalThis
mutableGlobal.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 }
type FakeNode = Text | HTMLElement
const text = (value: string): Text => ({ nodeType: Node.TEXT_NODE, nodeValue: value, textContent: value }) as unknown as Text
const element = (localName: string, childNodes: FakeNode[] = [], properties: Record<string, unknown> = {}): HTMLElement =>
  ({
    nodeType: Node.ELEMENT_NODE,
    localName,
    childNodes,
    isContentEditable: true,
    get textContent() {
      return childNodes.map((child) => child.textContent).join('')
    },
    ...properties,
  }) as unknown as HTMLElement
const br = () => element('br')
const readEditable = (...childNodes: FakeNode[]): string => readFieldText(element('div', childNodes), FIELD_KINDS.contentEditable)

describe('field text', () => {
  it('reads the value of inputs and textareas', () => {
    assert.equal(readFieldText({ value: 'Hello' } as HTMLInputElement, FIELD_KINDS.input), 'Hello')
    assert.equal(readFieldText({ value: 'Line one\nLine two' } as HTMLTextAreaElement, FIELD_KINDS.textarea), 'Line one\nLine two')
  })

  it('starts a new line for each block, as Chrome and Gmail structure lines', () => {
    assert.equal(readEditable(text('Hi team'), element('div', [text('Thanks')])), 'Hi team\nThanks')
    assert.equal(readEditable(element('div', [text('Hi')]), element('div', [br()]), element('div', [text('Thanks')])), 'Hi\n\nThanks')
  })

  it('treats <br> as a line break, but not a placeholder <br> at the end of a block', () => {
    assert.equal(readEditable(element('p', [text('a'), br(), text('b')])), 'a\nb')
    assert.equal(readEditable(element('p', [text('a'), br()]), element('p', [text('b')])), 'a\nb')
    assert.equal(readEditable(element('p', [text('a'), br(), br()]), element('p', [text('b')])), 'a\n\nb')
  })

  it('adds no line for a final <br>, so an empty editor reads as empty', () => {
    assert.equal(readEditable(element('p', [br()])), '')
    assert.equal(readEditable(text('a'), br()), 'a')
    assert.equal(readEditable(element('p', [text('a')]), element('p', [br()])), 'a\n')
  })

  it('keeps inline formatting on the same line', () => {
    assert.equal(readEditable(element('p', [text('Hello '), element('b', [text('big')]), text(' world')])), 'Hello big world')
  })

  it('reads non-editable parts such as mentions whole, ignoring blocks inside them', () => {
    const mention = element('span', [element('div', [text('@Jo')]), text('hn')], { isContentEditable: false })
    assert.equal(readEditable(element('p', [text('Thanks '), mention, text(' for this')])), 'Thanks @John for this')
  })

  it('reads an image as its alt text', () => {
    assert.equal(readEditable(element('p', [text('Nice '), element('img', [], { alt: '😀' })])), 'Nice 😀')
  })

  describe('mapping offsets back to the DOM', () => {
    const first = text('Hello ')
    const bold = text('big')
    const last = text(' world')
    const second = text('Next line')
    const mention = element('span', [text('@John')], { isContentEditable: false })
    const root = element('div', [element('p', [first, element('b', [bold]), last, mention]), element('p', [second])])
    const textMap = mapEditableText(root)

    it('reads the same text the field reports', () => {
      assert.equal(textMap.text, 'Hello big world@John\nNext line')
      assert.equal(readFieldText(root, FIELD_KINDS.contentEditable), textMap.text)
    })

    it('finds a span inside one text node', () => {
      assert.deepEqual(findEditablePositions(textMap, 0, 5), { startNode: first, startOffset: 0, endNode: first, endOffset: 5 })
    })

    it('finds a span crossing inline formatting', () => {
      assert.deepEqual(findEditablePositions(textMap, 6, 15), { startNode: bold, startOffset: 0, endNode: last, endOffset: 6 })
    })

    it('finds a span after a line break', () => {
      assert.deepEqual(findEditablePositions(textMap, 21, 25), { startNode: second, startOffset: 0, endNode: second, endOffset: 4 })
    })

    it('refuses a span touching a non-editable part', () => {
      assert.equal(findEditablePositions(textMap, 16, 18), null)
      assert.equal(findEditablePositions(textMap, 10, 18), null)
    })

    it('finds the place for an insertion, at the end of the text before it', () => {
      assert.deepEqual(findEditablePositions(textMap, 5, 5), { startNode: first, startOffset: 5, endNode: first, endOffset: 5 })
      assert.deepEqual(findEditablePositions(textMap, 6, 6), { startNode: first, startOffset: 6, endNode: first, endOffset: 6 })
      assert.equal(findEditablePositions(textMap, 17, 17), null)
    })

    it('finds a caret position, or nothing inside a non-editable part', () => {
      assert.deepEqual(findEditableCaret(textMap, 21), { node: second, offset: 0 })
      assert.deepEqual(findEditableCaret(textMap, 30), { node: second, offset: 9 })
      assert.equal(findEditableCaret(textMap, 17), null)
    })

    it('turns a DOM position back into an offset', () => {
      assert.equal(findEditableOffset(textMap, last, 3), 12)
      assert.equal(findEditableOffset(textMap, second, 0), 21)
      assert.equal(findEditableOffset(textMap, mention, 0), null)
    })
  })

  it('leaves out what a site adapter excludes, without affecting the offsets of the rest', () => {
    const own = text('My reply')
    const isQuote = (selector: string) => selector === '.quote'
    const quote = element('div', [text('Earlier message')], { matches: isQuote })
    const reply = element('div', [own], { matches: () => false })
    const root = element('div', [reply, element('br', [], { matches: () => false }), quote], { matches: () => false })

    const textMap = mapEditableText(root, '.quote')
    assert.equal(textMap.text, 'My reply\n', 'the blank line before the quote stays; the quote does not')
    assert.deepEqual(textMap.textNodes, [{ node: own, start: 0 }])
  })

  it('skips scripts, styles and the head of an editable document', () => {
    assert.equal(readEditable(element('head', [text('Title')]), text('a'), element('style', [text('.x{}')]), element('script', [text('x()')])), 'a')
  })
})
