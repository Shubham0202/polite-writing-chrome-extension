/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { FIELD_KINDS, type FieldElementByKind, type FieldKind } from './fieldEligibility.ts'
import { getSiteAdapter } from './siteAdapters.ts'

// Elements that start a new line. Chosen by tag rather than computed style, so reading never forces a style recalculation.
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul',
])
// <head> is only reached when a whole iframe document is editable.
const SKIPPED_TAGS = new Set(['head', 'noscript', 'script', 'style', 'template'])
const SITE_EXCLUDED_SELECTOR = getSiteAdapter(globalThis.location?.hostname).excludedSelector

export interface TextNodeEntry {
  node: Text
  start: number
}

export type AtomRange = [start: number, end: number]

export interface EditableTextMap {
  text: string
  textNodes: TextNodeEntry[]
  atoms: AtomRange[]
}

export interface EditablePositions {
  startNode: Text
  startOffset: number
  endNode: Text
  endOffset: number
}

export interface EditableCaret {
  node: Text
  offset: number
}

// The reader checks nodeType before it uses members that only text nodes, elements or images have, which TypeScript
// cannot follow, so within the reader a visited node shows the members of all three.
type VisitedNode = Text & HTMLElement & HTMLImageElement

type SelectionRoot = Node & { getSelection?: () => Selection | null }

// Reads the text as the user sees it: blocks and <br> start new lines, an image counts as its alt text (emoji are
// often images), and non-editable parts such as mentions are read whole. The returned map links offsets in that text
// back to the DOM; `atoms` are the parts that have no editable text behind them.
export const mapEditableText = (root: HTMLElement, excludedSelector: string | undefined = SITE_EXCLUDED_SELECTOR): EditableTextMap => {
  const parts: string[] = []
  const textNodes: TextNodeEntry[] = []
  const atoms: AtomRange[] = []
  let length = 0
  let needsLineBreak = false
  let endsWithBreakElement = false

  const push = (value: string): void => {
    parts.push(value)
    length += value.length
  }

  const append = (value: string, isBreakElement = false): number => {
    if (needsLineBreak && parts.length > 0 && !parts.at(-1)!.endsWith('\n')) push('\n')
    needsLineBreak = false
    endsWithBreakElement = isBreakElement
    const start = length
    push(value)
    return start
  }

  const appendAtom = (value: string | null): void => {
    if (!value) return
    const start = append(value)
    atoms.push([start, start + value.length])
  }

  const visit = (node: VisitedNode): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue) textNodes.push({ node, start: append(node.nodeValue) })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIPPED_TAGS.has(node.localName)) return
    if (excludedSelector && node.matches(excludedSelector)) return
    if (node.localName === 'br') return void append('\n', true)
    if (node.localName === 'img') return appendAtom(node.alt)

    const isBlock = BLOCK_TAGS.has(node.localName)
    if (isBlock) needsLineBreak = true
    if (node === root || node.isContentEditable) node.childNodes.forEach(visit as (node: ChildNode) => void)
    else appendAtom(node.textContent)
    if (isBlock) needsLineBreak = true
  }

  visit(root as VisitedNode)
  const text = parts.join('')
  // A final <br> adds no line of its own; editors keep it only so an empty last line has height.
  return { text: endsWithBreakElement ? text.slice(0, -1) : text, textNodes, atoms }
}

const findTextNodeAt = (textNodes: TextNodeEntry[], isInside: (start: number, end: number) => boolean): TextNodeEntry | undefined => textNodes.find(({ node, start }) => isInside(start, start + node.nodeValue!.length))

export const findEditableCaret = ({ textNodes }: Pick<EditableTextMap, 'textNodes'>, offset: number): EditableCaret | null => {
  const match = findTextNodeAt(textNodes, (nodeStart, nodeEnd) => offset >= nodeStart && offset <= nodeEnd)
  return match ? { node: match.node, offset: offset - match.start } : null
}

// Returns where a span of the text starts and ends in the DOM, or null when it touches something that is not editable text.
export const findEditablePositions = (
  { textNodes, atoms }: Pick<EditableTextMap, 'textNodes' | 'atoms'>,
  start: number,
  end: number,
): EditablePositions | null => {
  if (atoms.some(([atomStart, atomEnd]) => start < atomEnd && atomStart < end)) return null

  if (start === end) {
    const caret = findEditableCaret({ textNodes }, start)
    return caret && { startNode: caret.node, startOffset: caret.offset, endNode: caret.node, endOffset: caret.offset }
  }

  const first = findTextNodeAt(textNodes, (nodeStart, nodeEnd) => start >= nodeStart && start < nodeEnd)
  const last = findTextNodeAt(textNodes, (nodeStart, nodeEnd) => end > nodeStart && end <= nodeEnd)
  if (!first || !last) return null

  return { startNode: first.node, startOffset: start - first.start, endNode: last.node, endOffset: end - last.start }
}

export const findEditableOffset = ({ textNodes }: Pick<EditableTextMap, 'textNodes'>, node: Node | null, nodeOffset: number): number | null => {
  const match = textNodes.find((entry) => entry.node === node)
  return match ? match.start + nodeOffset : null
}

export const getFieldSelection = (field: HTMLElement): Selection => (field.getRootNode() as SelectionRoot).getSelection?.() ?? getSelection()!

const TEXT_READERS: { [Kind in FieldKind]: (field: FieldElementByKind[Kind]) => string } = {
  [FIELD_KINDS.input]: (field) => field.value,
  [FIELD_KINDS.textarea]: (field) => field.value,
  [FIELD_KINDS.contentEditable]: (field) => mapEditableText(field).text,
}

export const readFieldText = <Kind extends FieldKind>(field: FieldElementByKind[Kind], kind: Kind): string => TEXT_READERS[kind](field)
