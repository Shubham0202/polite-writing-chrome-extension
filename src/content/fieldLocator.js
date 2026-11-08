/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { FIELD_KINDS } from './fieldEligibility.js'
import { findEditableOffset, findEditablePositions, getFieldSelection, mapEditableText } from './fieldText.js'

const MIRRORED_STYLES = [
  'boxSizing', 'direction', 'fontFamily', 'fontFeatureSettings', 'fontKerning', 'fontSize', 'fontStretch', 'fontStyle',
  'fontVariant', 'fontWeight', 'letterSpacing', 'lineHeight', 'overflowWrap', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingTop', 'tabSize', 'textAlign', 'textIndent', 'textTransform', 'whiteSpace', 'wordBreak', 'wordSpacing',
]

const createEditableLocator = (field) => {
  let textMap = null

  const getRects = (start, end) => {
    const positions = findEditablePositions(textMap, start, end)
    if (!positions) return []
    const range = document.createRange()
    range.setStart(positions.startNode, positions.startOffset)
    range.setEnd(positions.endNode, positions.endOffset)
    return [...range.getClientRects()]
  }

  const getCaretOffset = () => {
    const selection = getFieldSelection(field)
    return selection.isCollapsed ? findEditableOffset(textMap, selection.anchorNode, selection.anchorOffset) : null
  }

  // Focus moving into the card must not lose the caret, which the browser does not restore for rich text.
  const captureSelection = () => {
    const selection = getFieldSelection(field)
    const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    return () => {
      if (!range) return
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  return {
    refresh: () => {
      textMap = mapEditableText(field)
    },
    getRects,
    getCaretOffset,
    captureSelection,
  }
}

const MIRROR_LAYOUT = {
  [FIELD_KINDS.input]: () => ({ width: 'max-content', whiteSpace: 'pre' }),
  [FIELD_KINDS.textarea]: (field) => ({ width: `${field.clientWidth}px` }),
}

// A single-line input centres its text vertically; a textarea starts at the top.
const MIRROR_TOP_OFFSET = {
  [FIELD_KINDS.input]: (field, mirror) => (field.clientHeight - mirror.offsetHeight) / 2,
  [FIELD_KINDS.textarea]: () => 0,
}

// Text inside inputs and textareas has no DOM nodes to measure, so a hidden copy with the same layout stands in for it.
const createMirrorLocator = (field, kind, mirror) => {
  const range = document.createRange()
  let textNode = null
  let topOffset = 0

  const refresh = () => {
    const styles = getComputedStyle(field)
    MIRRORED_STYLES.forEach((name) => {
      mirror.style[name] = styles[name]
    })
    Object.assign(mirror.style, MIRROR_LAYOUT[kind](field))
    textNode = document.createTextNode(field.value)
    mirror.replaceChildren(textNode)
    topOffset = MIRROR_TOP_OFFSET[kind](field, mirror)
  }

  const getRects = (start, end) => {
    range.setStart(textNode, start)
    range.setEnd(textNode, end)
    const origin = mirror.getBoundingClientRect()
    const fieldBox = field.getBoundingClientRect()
    const shiftLeft = fieldBox.left + field.clientLeft - field.scrollLeft - origin.left
    const shiftTop = fieldBox.top + field.clientTop - field.scrollTop - origin.top + topOffset
    return [...range.getClientRects()].map((rect) => new DOMRect(rect.left + shiftLeft, rect.top + shiftTop, rect.width, rect.height))
  }

  return {
    refresh,
    getRects,
    getCaretOffset: () => (field.selectionStart === field.selectionEnd ? field.selectionStart : null),
    captureSelection: () => () => {},
  }
}

const LOCATOR_FACTORIES = {
  [FIELD_KINDS.input]: createMirrorLocator,
  [FIELD_KINDS.textarea]: createMirrorLocator,
  [FIELD_KINDS.contentEditable]: createEditableLocator,
}

export const createFieldLocator = (field, kind, mirror) => LOCATOR_FACTORIES[kind](field, kind, mirror)

const clipsContent = ({ overflowX, overflowY }) => overflowX !== 'visible' || overflowY !== 'visible'

// Long rich-text fields often scroll inside an outer box, so the field's own rectangle overstates what can be seen.
export const findClippingAncestors = (field) => {
  const ancestors = []
  for (let element = field.parentElement ?? field.getRootNode().host; element; element = element.parentElement ?? element.getRootNode().host) {
    if (element !== document.documentElement && clipsContent(getComputedStyle(element))) ancestors.push(element)
  }
  return ancestors
}

export const getVisibleBox = (field, clippingAncestors) => {
  const box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
  for (const element of [field, ...clippingAncestors]) {
    const rect = element.getBoundingClientRect()
    box.left = Math.max(box.left, rect.left)
    box.top = Math.max(box.top, rect.top)
    box.right = Math.min(box.right, rect.right)
    box.bottom = Math.min(box.bottom, rect.bottom)
  }
  return box.right > box.left && box.bottom > box.top ? box : null
}
