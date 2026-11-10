/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { logDebug } from '../utils/debugLog.js'
import { findEdit } from '../utils/textRebase.js'
import { FIELD_KINDS } from './fieldEligibility.js'
import { findEditableCaret, findEditableOffset, findEditablePositions, getFieldSelection, mapEditableText, readFieldText } from './fieldText.js'

// Editors that own their document can apply an edit just after the command returns.
const VERIFY_ATTEMPTS = 6
const VERIFY_INTERVAL_MS = 20
const SELECTION_SYNC_LIMIT_MS = 50

const selectValueRange = (field, start, end) => {
  field.setSelectionRange(start, end)
  return true
}

const selectEditableRange = (field, start, end) => {
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

const moveValueCaret = (field, offset) => field.setSelectionRange(offset, offset)

const moveEditableCaret = (field, offset) => {
  const position = findEditableCaret(mapEditableText(field), offset)
  if (position) getFieldSelection(field).collapse(position.node, position.offset)
}

const SELECT_RANGE = {
  [FIELD_KINDS.input]: selectValueRange,
  [FIELD_KINDS.textarea]: selectValueRange,
  [FIELD_KINDS.contentEditable]: selectEditableRange,
}

const MOVE_CARET = {
  [FIELD_KINDS.input]: moveValueCaret,
  [FIELD_KINDS.textarea]: moveValueCaret,
  [FIELD_KINDS.contentEditable]: moveEditableCaret,
}

// Browsers turn spaces at line edges into non-breaking ones, and editors keep invisible characters next to mentions and
// emoji, putting them back after every edit. Neither is a difference in the user's text.
const INVISIBLE_CHARACTERS = /[\u200B\u2060\uFEFF]/g
const toComparableText = (text) => text.replaceAll('\u00A0', ' ').replace(INVISIBLE_CHARACTERS, '')
export const isSameText = (first, second) => toComparableText(first) === toComparableText(second)

const getEditableSelectionOffsets = (field) => {
  const textMap = mapEditableText(field)
  const { anchorNode, anchorOffset, focusNode, focusOffset } = getFieldSelection(field)
  return [findEditableOffset(textMap, anchorNode, anchorOffset), findEditableOffset(textMap, focusNode, focusOffset)]
}

const SELECTION_OFFSETS = {
  [FIELD_KINDS.input]: (field) => [field.selectionStart, field.selectionEnd],
  [FIELD_KINDS.textarea]: (field) => [field.selectionStart, field.selectionEnd],
  [FIELD_KINDS.contentEditable]: getEditableSelectionOffsets,
}

// Says which step of an edit a site broke, in offsets and lengths only, never the text itself.
const describeFailedEdit = ({ field, kind, start, end, selection, isCommandRun, text, expected }) => {
  const actual = readFieldText(field, kind)
  let firstDifference = 0
  while (firstDifference < expected.length && actual[firstDifference] === expected[firstDifference]) firstDifference += 1
  const outcome = isSameText(actual, text)
    ? 'the text did not change'
    : `the text first differs from the expected text at ${firstDifference}, length ${actual.length} instead of ${expected.length}`
  const focus = field.getRootNode().activeElement === field ? 'in the field' : 'elsewhere'
  return `Edit of ${start}–${end} failed: selection was ${selection.join('–')}, focus ${focus}, edit command ${isCommandRun ? 'ran' : 'was refused'}, ${outcome}`
}

// Right after the command, the field shows the browser's raw edit; an editor that rejects or moves it only does so
// once it has processed that change, so the first read waits too.
const waitForText = async (field, kind, expected) => {
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS))
    if (isSameText(readFieldText(field, kind), expected)) return true
  }
  return false
}

export const shiftCaret = (caret, start, end, replacementLength) => {
  if (caret === null) return null
  if (caret >= end) return caret + replacementLength - (end - start)
  return caret <= start ? caret : start + replacementLength
}

// Emoji images and mentions have no editable text, so an edit across them is split into edits of the text between
// them. Each one must still be in the replacement, in order; the parts that come out the same are left alone. Returns
// null when there is no safe split: the replacement drops one, or one sticks out of the edited span. A mention is
// looked for by what it shows, because editors such as Jira's keep invisible characters inside it that a rewrite drops.
export const splitAroundAtoms = (text, atoms, start, end, replacement) => {
  const parts = []
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
export const narrowToChange = (text, { start, end, replacement }) => {
  const change = findEdit(text.slice(start, end), replacement)
  return { start: start + change.start, end: start + change.oldEnd, replacement: replacement.slice(change.start, change.newEnd) }
}

// Goes through the browser's edit command, so the page gets a normal input event and Ctrl+Z can undo it. Resolves to
// whether the field really ended up with the expected text.
const replaceSpan = async ({ field, kind, caret, start, end, replacement }) => {
  const text = readFieldText(field, kind)
  const expected = text.slice(0, start) + replacement + text.slice(end)
  const { scrollTop } = field
  // The edit command acts on whatever has focus, which must be this field and no other.
  field.focus()
  if (!SELECT_RANGE[kind](field, start, end)) {
    logDebug(`Edit of ${start}–${end} failed: that text could not be selected`)
    return false
  }
  if (kind === FIELD_KINDS.contentEditable) await waitForSelectionChange()

  const selection = SELECTION_OFFSETS[kind](field)
  const isCommandRun = replacement ? document.execCommand('insertText', false, replacement) : document.execCommand('delete')

  const isReplaced = await waitForText(field, kind, expected)
  if (!isReplaced) logDebug(describeFailedEdit({ field, kind, start, end, selection, isCommandRun, text, expected }))
  // A maxlength can cut a replacement short, which is worse than no change at all.
  if (!isReplaced && readFieldText(field, kind) !== text) document.execCommand('undo')

  const newCaret = isReplaced ? shiftCaret(caret, start, end, replacement.length) : caret
  if (newCaret !== null) MOVE_CARET[kind](field, newCaret)
  field.scrollTop = scrollTop
  return isReplaced
}

// From the last part to the first, so the offsets of the parts still to do stay valid. A part that fails takes the ones
// already made back with it: half a rewrite is worse than none.
const replaceInParts = async ({ field, kind, caret, start, end, replacement }, parts) => {
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

export const replaceFieldText = async (edit) => {
  if (edit.kind !== FIELD_KINDS.contentEditable) return replaceSpan(edit)
  const { text, atoms } = mapEditableText(edit.field)
  const parts = splitAroundAtoms(text, atoms, edit.start, edit.end, edit.replacement)?.map((part) => narrowToChange(text, part))
  if (!parts) {
    logDebug(`Edit of ${edit.start}–${edit.end} failed: it would drop or cut through a mention or emoji`)
    return false
  }
  if (parts.length > 1) return replaceInParts(edit, parts)
  return parts.length ? replaceSpan({ ...edit, ...parts[0] }) : true
}
