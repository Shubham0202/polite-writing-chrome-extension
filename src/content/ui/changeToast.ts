import { computeCardPosition } from './cardPosition.ts'
import { createElement, keepFocusOnMouseDown, type Box } from './dom.ts'

const TOAST_DURATION_MS = 8000

export interface ChangeToast {
  show: (box: Box, message: string, onUndo?: () => void) => void
  hide: () => void
}

// Ctrl+Z also undoes a change, so the button stays out of the Tab order, like the badge.
export const createChangeToast = (parent: ParentNode): ChangeToast => {
  const toast = createElement('div', { className: 'wb-toast', attributes: { hidden: '' } })
  let timer: ReturnType<typeof setTimeout> | null = null
  keepFocusOnMouseDown(toast)
  parent.append(toast)

  const hide = () => {
    clearTimeout(timer!)
    toast.hidden = true
  }

  const show = (box: Box, message: string, onUndo?: () => void) => {
    hide()
    toast.replaceChildren(
      createElement('span', { text: message }),
      ...(onUndo ? [createElement('button', { className: 'wb-button', text: 'Undo', attributes: { type: 'button', tabindex: '-1' }, onClick: onUndo })] : []),
    )
    toast.hidden = false
    const size = toast.getBoundingClientRect()
    const anchor = { left: box.right - size.width, top: box.top, bottom: box.bottom }
    const { left, top } = computeCardPosition(anchor, size, { width: innerWidth, height: innerHeight })
    toast.style.transform = `translate(${left}px, ${top}px)`
    timer = setTimeout(hide, TOAST_DURATION_MS)
  }

  return { show, hide }
}
