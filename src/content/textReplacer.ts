/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { devLog, type LogDetails } from '../utils/devLog.ts'
import { findEdit } from '../utils/textRebase.ts'
import { FIELD_KINDS, type FieldElementByKind, type FieldKind } from './fieldEligibility.ts'
import {
  findEditableCaret,
  findEditableOffset,
  findEditablePositions,
  getFieldSelection,
  mapEditableText,
  readFieldText,
  type AtomRange,
  type EditableTextMap,
} from './fieldText.ts'

export interface EditRange {
  start: number
  end: number
  replacement: string
}

// The caret is null when the field has no caret to keep in place.
export interface FieldEdit<Kind extends FieldKind = FieldKind> extends EditRange {
  field: FieldElementByKind[Kind]
  kind: Kind
  caret: number | null
}

type SelectionOffsets = [start: number | null, end: number | null]

interface FailedEdit {
  field: HTMLElement
  kind: FieldKind
  start: number
  end: number
  selection: SelectionOffsets
  isCommandRun: boolean
  text: string
  expected: string
}

type ActiveElementRoot = Node & Pick<DocumentOrShadowRoot, 'activeElement'>


type ValueField = HTMLInputElement | HTMLTextAreaElement

// Editors that own their document can apply an edit just after the command returns.
const VERIFY_ATTEMPTS = 6
const VERIFY_INTERVAL_MS = 20
const SELECTION_SYNC_LIMIT_MS = 50

const selectValueRange = (field: ValueField, start: number, end: number): boolean => {
  field.setSelectionRange(start, end)
  return true
}

const selectEditableRange = (field: HTMLElement, start: number, end: number): boolean => {
  const positions = findEditablePositions(mapEditableText(field), start, end)
  if (!positions) return false

  const range = document.createRange()
  range.setStart(positions.startNode, positions.startOffset)
  range.setEnd(positions.endNode, positions.endOffset)
  const selection = getFieldSelection(field)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

// Editors such as Lexical learn the selection from selectionchange, which the browser fires later. Editing before they
// have heard about it puts the text wherever their last known caret was.
const waitForSelectionChange = () =>
  new Promise((resolve) => {
    document.addEventListener('selectionchange', resolve, { once: true })
    setTimeout(resolve, SELECTION_SYNC_LIMIT_MS)
  })

const moveValueCaret = (field: ValueField, offset: number): void => field.setSelectionRange(offset, offset)

const moveEditableCaret = (field: HTMLElement, offset: number): void => {
  const position = findEditableCaret(mapEditableText(field), offset)
  if (position) getFieldSelection(field).collapse(position.node, position.offset)
}

const SELECT_RANGE: { [Kind in FieldKind]: (field: FieldElementByKind[Kind], start: number, end: number) => boolean } = {
  [FIELD_KINDS.input]: selectValueRange,
  [FIELD_KINDS.textarea]: selectValueRange,
  [FIELD_KINDS.contentEditable]: selectEditableRange,
}

const MOVE_CARET: { [Kind in FieldKind]: (field: FieldElementByKind[Kind], offset: number) => void } = {
  [FIELD_KINDS.input]: moveValueCaret,
  [FIELD_KINDS.textarea]: moveValueCaret,
  [FIELD_KINDS.contentEditable]: moveEditableCaret,
}

// Browsers turn spaces at line edges into non-breaking ones, and editors keep invisible characters next to mentions and
// emoji, putting them back after every edit. Neither is a difference in the user's text.
const INVISIBLE_CHARACTERS = /[\u200B\u2060\uFEFF]/g
const toComparableText = (text: string): string => text.replaceAll('\u00A0', ' ').replace(INVISIBLE_CHARACTERS, '')
export const isSameText = (first: string, second: string): boolean => toComparableText(first) === toComparableText(second)

const getEditableSelectionOffsets = (field: HTMLElement): SelectionOffsets => {
  const textMap = mapEditableText(field)
  const { anchorNode, anchorOffset, focusNode, focusOffset } = getFieldSelection(field)
  return [findEditableOffset(textMap, anchorNode, anchorOffset), findEditableOffset(textMap, focusNode, focusOffset)]
}

const SELECTION_OFFSETS: { [Kind in FieldKind]: (field: FieldElementByKind[Kind]) => SelectionOffsets } = {
  [FIELD_KINDS.input]: (field) => [field.selectionStart, field.selectionEnd],
  [FIELD_KINDS.textarea]: (field) => [field.selectionStart, field.selectionEnd],
  [FIELD_KINDS.contentEditable]: getEditableSelectionOffsets,
}

// Says which step of an edit a site broke, in positions and lengths only, never the text itself.
const describeFailedEdit = ({ field, kind, start, end, selection, isCommandRun, text, expected }: FailedEdit): LogDetails => {
  const actual = readFieldText(field, kind)
  let firstDifference = 0
  while (firstDifference < expected.length && actual[firstDifference] === expected[firstDifference]) firstDifference += 1
  const isUnchanged = isSameText(actual, text)
  return {
    range: `${start}–${end}`,
    selection: selection.join('–'),
    focus: (field.getRootNode() as ActiveElementRoot).activeElement === field ? 'in the field' : 'elsewhere',
    editCommand: isCommandRun ? 'ran' : 'was refused',
    outcome: isUnchanged ? 'the text did not change' : `differs from the expected text at ${firstDifference}`,
    length: actual.length,
    expectedLength: expected.length,
  }
}

// Right after the command, the field shows the browser's raw edit; an editor that rejects or moves it only does so
// once it has processed that change, so the first read waits too.
const waitForText = async (field: HTMLElement, kind: FieldKind, expected: string): Promise<boolean> => {
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS))
    if (isSameText(readFieldText(field, kind), expected)) return true
  }
  return false
}

export const shiftCaret = (caret: number | null, start: number, end: number, replacementLength: number): number | null => {
  if (caret === null) return null
  if (caret >= end) return caret + replacementLength - (end - start)
  return caret <= start ? caret : start + replacementLength
}

// Emoji images and mentions have no editable text, so an edit across them is split into edits of the text between
// them. Each one must still be in the replacement, in order; the parts that come out the same are left alone. Returns
// null when there is no safe split: the replacement drops one, or one sticks out of the edited span. A mention is
// looked for by what it shows, because editors such as Jira's keep invisible characters inside it that a rewrite drops.
export const splitAroundAtoms = (
  text: string,
  atoms: readonly AtomRange[],
  start: number,
  end: number,
  replacement: string,
): EditRange[] | null => {
  const parts: EditRange[] = []
  let from = start
  let searchFrom = 0
  for (const [atomStart, atomEnd] of atoms) {
    if (atomEnd <= start || atomStart >= end) continue
    if (atomStart < start || atomEnd > end) return null
    const atomText = toComparableText(text.slice(atomStart, atomEnd))
    const found = atomText ? replacement.indexOf(atomText, searchFrom) : -1
    if (found === -1) return null
    parts.push({ start: from, end: atomStart, replacement: replacement.slice(searchFrom, found) })
    from = atomEnd
    searchFrom = found + atomText.length
  }
  parts.push({ start: from, end, replacement: replacement.slice(searchFrom) })
  return parts.filter((part) => !isSameText(text.slice(part.start, part.end), part.replacement))
}

// A line break between two paragraphs has no text node to select, so an edit cannot start or end on one, as a rewrite
// of the whole text does when the field ends with an empty line. Only what actually changes is edited instead, which
// also keeps the formatting of the text around it.
export const narrowToChange = (text: string, { start, end, replacement }: EditRange): EditRange => {
  const change = findEdit(text.slice(start, end), replacement)
  return { start: start + change.start, end: start + change.oldEnd, replacement: replacement.slice(change.start, change.newEnd) }
}

const isLineBreakWithoutNode = ({ text, textNodes }: EditableTextMap, index: number): boolean =>
  text[index] === '\n' && !textNodes.some(({ node, start }) => index >= start && index < start + node.nodeValue!.length)

// A narrowed change can still start or end right on such a line break: a rewrite that adds a comma at the end of one
// line and changes the next starts on it. The edit takes in the unchanged characters beside the break instead, in the
// span and the replacement alike, so the result is the same. An insertion only needs a caret, which a node edge gives.
export const widenToTextNodes = (textMap: EditableTextMap, { start, end, replacement }: EditRange): EditRange => {
  if (start === end) return { start, end, replacement }
  let from = start
  let to = end
  while (from > 0 && isLineBreakWithoutNode(textMap, from)) from -= 1
  while (to < textMap.text.length && isLineBreakWithoutNode(textMap, to - 1)) to += 1
  return { start: from, end: to, replacement: textMap.text.slice(from, start) + replacement + textMap.text.slice(end, to) }
}

// Goes through the browser's edit command, so the page gets a normal input event and Ctrl+Z can undo it. Resolves to
// whether the field really ended up with the expected text.
const replaceSpan = async <Kind extends FieldKind>({ field, kind, caret, start, end, replacement }: FieldEdit<Kind>): Promise<boolean> => {
  const text = readFieldText(field, kind)
  const expected = text.slice(0, start) + replacement + text.slice(end)
  const { scrollTop } = field
  // The edit command acts on whatever has focus, which must be this field and no other.
  field.focus()
  if (!SELECT_RANGE[kind](field, start, end)) {
    devLog('Edit failed: that text could not be selected', () => ({ range: `${start}–${end}` }))
    return false
  }
  if (kind === FIELD_KINDS.contentEditable) await waitForSelectionChange()

  const selection = SELECTION_OFFSETS[kind](field)
  const isCommandRun = replacement ? document.execCommand('insertText', false, replacement) : document.execCommand('delete')

  const isReplaced = await waitForText(field, kind, expected)
  if (!isReplaced) devLog('Edit failed', () => describeFailedEdit({ field, kind, start, end, selection, isCommandRun, text, expected }))
  // A maxlength can cut a replacement short, which is worse than no change at all.
  if (!isReplaced && readFieldText(field, kind) !== text) document.execCommand('undo')

  const newCaret = isReplaced ? shiftCaret(caret, start, end, replacement.length) : caret
  if (newCaret !== null) MOVE_CARET[kind](field, newCaret)
  field.scrollTop = scrollTop
  return isReplaced
}

// From the last part to the first, so the offsets of the parts still to do stay valid. A part that fails takes the ones
// already made back with it: half a rewrite is worse than none.
const replaceInParts = async <Kind extends FieldKind>(
  { field, kind, caret, start, end, replacement }: FieldEdit<Kind>,
  parts: EditRange[],
): Promise<boolean> => {
  for (const [index, part] of [...parts].reverse().entries()) {
    if (!(await replaceSpan({ field, kind, caret: null, ...part }))) {
      for (let made = 0; made < index; made += 1) document.execCommand('undo')
      return false
    }
  }
  const newCaret = shiftCaret(caret, start, end, replacement.length)
  if (newCaret !== null) MOVE_CARET[kind](field, newCaret)
  return true
}

export const replaceFieldText = async (edit: FieldEdit): Promise<boolean> => {
  if (edit.kind !== FIELD_KINDS.contentEditable) return replaceSpan(edit)
  const textMap = mapEditableText(edit.field)
  const { text, atoms } = textMap
  const parts = splitAroundAtoms(text, atoms, edit.start, edit.end, edit.replacement)?.map((part) => widenToTextNodes(textMap, narrowToChange(text, part)))
  if (!parts) {
    devLog('Edit failed: it would drop or cut through a mention or emoji', () => ({ range: `${edit.start}–${edit.end}` }))
    return false
  }
  if (parts.length > 1) return replaceInParts(edit, parts)
  return parts.length ? replaceSpan({ ...edit, ...parts[0] }) : true
}
