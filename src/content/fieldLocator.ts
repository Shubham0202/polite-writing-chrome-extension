/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { FIELD_KINDS, type FieldElementByKind, type FieldKind } from './fieldEligibility.ts'
import { findEditableOffset, findEditablePositions, getFieldSelection, mapEditableText, type EditableTextMap } from './fieldText.ts'

export interface FieldLocator {
  refresh: () => void
  getRects: (start: number, end: number) => DOMRect[]
  getCaretOffset: () => number | null
  captureSelection: () => () => void
}

export interface VisibleBox {
  left: number
  top: number
  right: number
  bottom: number
}

// Inputs and textareas are the fields whose text has no DOM nodes of its own.
type MirroredFieldKind = typeof FIELD_KINDS.input | typeof FIELD_KINDS.textarea
type StyleName = { [Name in keyof CSSStyleDeclaration]: CSSStyleDeclaration[Name] extends string ? Name : never }[keyof CSSStyleDeclaration]
type MirrorLayout = Partial<Pick<CSSStyleDeclaration, 'width' | 'whiteSpace'>>
// Only shadow roots have a host.
type HostedRoot = Node & Partial<Pick<ShadowRoot, 'host'>>

const MIRRORED_STYLES: StyleName[] = [
  'boxSizing', 'direction', 'fontFamily', 'fontFeatureSettings', 'fontKerning', 'fontSize', 'fontStretch', 'fontStyle',
  'fontVariant', 'fontWeight', 'letterSpacing', 'lineHeight', 'overflowWrap', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingTop', 'tabSize', 'textAlign', 'textIndent', 'textTransform', 'whiteSpace', 'wordBreak', 'wordSpacing',
]

const createEditableLocator = (field: HTMLElement): FieldLocator => {
  let textMap: EditableTextMap | null = null

  const getRects = (start: number, end: number): DOMRect[] => {
    const positions = findEditablePositions(textMap!, start, end)
    if (!positions) return []
    const range = document.createRange()
    range.setStart(positions.startNode, positions.startOffset)
    range.setEnd(positions.endNode, positions.endOffset)
    return [...range.getClientRects()]
  }

  const getCaretOffset = (): number | null => {
    const selection = getFieldSelection(field)
    return selection.isCollapsed ? findEditableOffset(textMap!, selection.anchorNode, selection.anchorOffset) : null
  }

  // Focus moving into the card must not lose the caret, which the browser does not restore for rich text.
  const captureSelection = (): (() => void) => {
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

const MIRROR_LAYOUT: { [Kind in MirroredFieldKind]: (field: FieldElementByKind[Kind]) => MirrorLayout } = {
  [FIELD_KINDS.input]: () => ({ width: 'max-content', whiteSpace: 'pre' }),
  [FIELD_KINDS.textarea]: (field) => ({ width: `${field.clientWidth}px` }),
}

// A single-line input centres its text vertically; a textarea starts at the top.
const MIRROR_TOP_OFFSET: { [Kind in MirroredFieldKind]: (field: FieldElementByKind[Kind], mirror: HTMLElement) => number } = {
  [FIELD_KINDS.input]: (field, mirror) => (field.clientHeight - mirror.offsetHeight) / 2,
  [FIELD_KINDS.textarea]: () => 0,
}

// Text inside inputs and textareas has no DOM nodes to measure, so a hidden copy with the same layout stands in for it.
const createMirrorLocator = <Kind extends MirroredFieldKind>(field: FieldElementByKind[Kind], kind: Kind, mirror: HTMLElement): FieldLocator => {
  const range = document.createRange()
  let textNode: Text | null = null
  let topOffset = 0

  const refresh = (): void => {
    const styles = getComputedStyle(field)
    MIRRORED_STYLES.forEach((name) => {
      mirror.style[name] = styles[name]
    })
    Object.assign(mirror.style, MIRROR_LAYOUT[kind](field))
    textNode = document.createTextNode(field.value)
    mirror.replaceChildren(textNode)
    topOffset = MIRROR_TOP_OFFSET[kind](field, mirror)
  }

  const getRects = (start: number, end: number): DOMRect[] => {
    range.setStart(textNode!, start)
    range.setEnd(textNode!, end)
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

const LOCATOR_FACTORIES: {
  [Kind in FieldKind]: (field: FieldElementByKind[Kind], kind: Kind, mirror: HTMLElement) => FieldLocator
} = {
  [FIELD_KINDS.input]: createMirrorLocator,
  [FIELD_KINDS.textarea]: createMirrorLocator,
  [FIELD_KINDS.contentEditable]: createEditableLocator,
}

export const createFieldLocator = <Kind extends FieldKind>(field: FieldElementByKind[Kind], kind: Kind, mirror: HTMLElement): FieldLocator => LOCATOR_FACTORIES[kind](field, kind, mirror)

const clipsContent = ({ overflowX, overflowY }: CSSStyleDeclaration): boolean => overflowX !== 'visible' || overflowY !== 'visible'

// Long rich-text fields often scroll inside an outer box, so the field's own rectangle overstates what can be seen.
export const findClippingAncestors = (field: HTMLElement): Element[] => {
  const ancestors: Element[] = []
  for (
    let element: Element | null | undefined = field.parentElement ?? (field.getRootNode() as HostedRoot).host;
    element;
    element = element.parentElement ?? (element.getRootNode() as HostedRoot).host
  ) {
    if (element !== document.documentElement && clipsContent(getComputedStyle(element))) ancestors.push(element)
  }
  return ancestors
}

export const getVisibleBox = (field: HTMLElement, clippingAncestors: readonly Element[]): VisibleBox | null => {
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
