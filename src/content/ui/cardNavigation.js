import { lookup } from '../../utils/lookup.js'

// Up and Down (and Page Up and Page Down) move between rows of buttons and land on the row's first button, which on a
// suggestion is Accept. Left and Right move along the row, to Dismiss and back. The edges stop rather than wrap.
const ROW_STEPS = { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1 }
const COLUMN_STEPS = { ArrowLeft: -1, ArrowRight: 1 }

const clamp = (value, max) => Math.min(Math.max(value, 0), max)

// Returns the button to focus, or null for keys that do not navigate.
export const getNavigationTarget = ({ rowSizes, row, column, key }) => {
  const rowStep = lookup(ROW_STEPS, key)
  if (rowStep) return { row: clamp(row + rowStep, rowSizes.length - 1), column: 0 }
  const columnStep = lookup(COLUMN_STEPS, key)
  if (columnStep) return { row, column: clamp(column + columnStep, rowSizes[row] - 1) }
  return null
}
