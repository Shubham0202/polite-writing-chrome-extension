import { computeCardPosition } from './cardPosition.js'
import { createElement, keepFocusOnMouseDown } from './dom.js'

const TOAST_DURATION_MS = 8000

// Ctrl+Z also undoes a change, so the button stays out of the Tab order, like the badge.
export const createChangeToast = (parent) => {
  const toast = createElement('div', { className: 'wb-toast', attributes: { hidden: '' } })
  let timer = null
  keepFocusOnMouseDown(toast)
  parent.append(toast)

  const hide = () => {
    clearTimeout(timer)
    toast.hidden = true
  }

  const show = (box, message, onUndo) => {
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
