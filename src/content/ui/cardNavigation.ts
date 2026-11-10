import { lookup } from '../../utils/lookup.ts'

// Up and Down (and Page Up and Page Down) move between rows of buttons and land on the row's first button, which on a
// suggestion is Accept. Left and Right move along the row, to Dismiss and back. The edges stop rather than wrap.
const ROW_STEPS = { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1 }
const COLUMN_STEPS = { ArrowLeft: -1, ArrowRight: 1 }

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)

export interface NavigationInput {
  rowSizes: readonly number[]
  row: number
  column: number
  key: string
}

export interface NavigationTarget {
  row: number
  column: number
}

// Returns the button to focus, or null for keys that do not navigate.
export const getNavigationTarget = ({ rowSizes, row, column, key }: NavigationInput): NavigationTarget | null => {
  const rowStep = lookup(ROW_STEPS, key)
  if (rowStep) return { row: clamp(row + rowStep, rowSizes.length - 1), column: 0 }
  const columnStep = lookup(COLUMN_STEPS, key)
  if (columnStep) return { row, column: clamp(column + columnStep, rowSizes[row] - 1) }
  return null
}
