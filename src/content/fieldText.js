/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { FIELD_KINDS } from './fieldEligibility.js'
import { getSiteAdapter } from './siteAdapters.js'

// Elements that start a new line. Chosen by tag rather than computed style, so reading never forces a style recalculation.
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul',
])
// <head> is only reached when a whole iframe document is editable.
const SKIPPED_TAGS = new Set(['head', 'noscript', 'script', 'style', 'template'])
const SITE_EXCLUDED_SELECTOR = getSiteAdapter(globalThis.location?.hostname).excludedSelector

// Reads the text as the user sees it: blocks and <br> start new lines, an image counts as its alt text (emoji are
// often images), and non-editable parts such as mentions are read whole. The returned map links offsets in that text
// back to the DOM; `atoms` are the parts that have no editable text behind them.
export const mapEditableText = (root, excludedSelector = SITE_EXCLUDED_SELECTOR) => {
  const parts = []
  const textNodes = []
  const atoms = []
  let length = 0
  let needsLineBreak = false
  let endsWithBreakElement = false

  const push = (value) => {
    parts.push(value)
    length += value.length
  }

  const append = (value, isBreakElement = false) => {
    if (needsLineBreak && parts.length > 0 && !parts.at(-1).endsWith('\n')) push('\n')
    needsLineBreak = false
    endsWithBreakElement = isBreakElement
    const start = length
    push(value)
    return start
  }

  const appendAtom = (value) => {
    if (!value) return
    const start = append(value)
    atoms.push([start, start + value.length])
  }

  const visit = (node) => {
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
    if (node === root || node.isContentEditable) node.childNodes.forEach(visit)
    else appendAtom(node.textContent)
    if (isBlock) needsLineBreak = true
  }

  visit(root)
  const text = parts.join('')
  // A final <br> adds no line of its own; editors keep it only so an empty last line has height.
  return { text: endsWithBreakElement ? text.slice(0, -1) : text, textNodes, atoms }
}

const findTextNodeAt = (textNodes, isInside) => textNodes.find(({ node, start }) => isInside(start, start + node.nodeValue.length))

export const findEditableCaret = ({ textNodes }, offset) => {
  const match = findTextNodeAt(textNodes, (nodeStart, nodeEnd) => offset >= nodeStart && offset <= nodeEnd)
  return match ? { node: match.node, offset: offset - match.start } : null
}

// Returns where a span of the text starts and ends in the DOM, or null when it touches something that is not editable text.
export const findEditablePositions = ({ textNodes, atoms }, start, end) => {
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

export const findEditableOffset = ({ textNodes }, node, nodeOffset) => {
  const match = textNodes.find((entry) => entry.node === node)
  return match ? match.start + nodeOffset : null
}

export const getFieldSelection = (field) => field.getRootNode().getSelection?.() ?? getSelection()

const TEXT_READERS = {
  [FIELD_KINDS.input]: (field) => field.value,
  [FIELD_KINDS.textarea]: (field) => field.value,
  [FIELD_KINDS.contentEditable]: (field) => mapEditableText(field).text,
}

export const readFieldText = (field, kind) => TEXT_READERS[kind](field)
