import { createElement, keepFocusOnMouseDown, type Box } from './dom.ts'

const BADGE_SIZE = 24
const BADGE_INSET = 4

export interface BadgeContent {
  label: string
  description: string
}

export interface FieldBadge {
  render: (box: Box, content: BadgeContent) => void
  hide: () => void
  getRect: () => DOMRect
}

// One badge for the active field. It stays out of the Tab order, because the page's own controls come first;
// the keyboard shortcut reaches the same suggestions.
export const createFieldBadge = (parent: ParentNode, { onOpen }: { onOpen: () => void }): FieldBadge => {
  const badge = createElement('button', { className: 'wb-badge', attributes: { type: 'button', tabindex: '-1', hidden: '' }, onClick: onOpen })
  keepFocusOnMouseDown(badge)
  parent.append(badge)

  const render = (box: Box, { label, description }: BadgeContent) => {
    badge.hidden = false
    badge.textContent = label
    badge.title = description
    badge.setAttribute('aria-label', description)
    const left = Math.max(box.left, box.right - badge.offsetWidth - BADGE_INSET)
    const top = Math.max(box.top, box.bottom - BADGE_SIZE - BADGE_INSET)
    badge.style.transform = `translate(${left}px, ${top}px)`
  }

  const hide = () => {
    badge.hidden = true
  }

  return { render, hide, getRect: () => badge.getBoundingClientRect() }
}
