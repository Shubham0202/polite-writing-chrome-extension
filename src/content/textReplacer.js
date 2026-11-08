import { FIELD_KINDS } from './fieldEligibility.js'
import { findEditableCaret, findEditablePositions, getFieldSelection, mapEditableText, readFieldText } from './fieldText.js'

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

const waitForText = async (field, kind, expected) => {
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
    if (isSameText(readFieldText(field, kind), expected)) return true
    await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS))
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
// null when there is no safe split: the replacement drops one, or one sticks out of the edited span.
export const splitAroundAtoms = (text, atoms, start, end, replacement) => {
  const parts = []
  let from = start
  let searchFrom = 0
  for (const [atomStart, atomEnd] of atoms) {
    if (atomEnd <= start || atomStart >= end) continue
    if (atomStart < start || atomEnd > end) return null
    const found = replacement.indexOf(text.slice(atomStart, atomEnd), searchFrom)
    if (found === -1) return null
    parts.push({ start: from, end: atomStart, replacement: replacement.slice(searchFrom, found) })
    from = atomEnd
    searchFrom = found + atomEnd - atomStart
  }
  parts.push({ start: from, end, replacement: replacement.slice(searchFrom) })
  return parts.filter((part) => !isSameText(text.slice(part.start, part.end), part.replacement))
}

// Goes through the browser's edit command, so the page gets a normal input event and Ctrl+Z can undo it. Resolves to
// whether the field really ended up with the expected text.
const replaceSpan = async ({ field, kind, caret, start, end, replacement }) => {
  const text = readFieldText(field, kind)
  const expected = text.slice(0, start) + replacement + text.slice(end)
  const { scrollTop } = field
  // The edit command acts on whatever has focus, which must be this field and no other.
  field.focus()
  if (!SELECT_RANGE[kind](field, start, end)) return false
  if (kind === FIELD_KINDS.contentEditable) await waitForSelectionChange()

  if (replacement) document.execCommand('insertText', false, replacement)
  else document.execCommand('delete')

  const isReplaced = await waitForText(field, kind, expected)
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
  const parts = splitAroundAtoms(text, atoms, edit.start, edit.end, edit.replacement)
  if (!parts) return false
  if (parts.length > 1) return replaceInParts(edit, parts)
  return parts.length ? replaceSpan({ ...edit, ...parts[0] }) : true
}
