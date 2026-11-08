import { CONFIDENCE, ENGINES } from '../../constants/corrections.js'
import { createElement } from './dom.js'

const ENGINE_CLASS = {
  [ENGINES.spelling]: 'wb-underline--spelling',
  [ENGINES.grammar]: 'wb-underline--grammar',
  [ENGINES.tense]: 'wb-underline--tense',
  [ENGINES.tone]: 'wb-underline--tone',
}
const UNDERLINE_THICKNESS = 2

const getUnderlineClass = ({ suggestion, isActive }) =>
  ['wb-underline', ENGINE_CLASS[suggestion.engine], suggestion.confidence === CONFIDENCE.low && 'wb-underline--uncertain', isActive && 'wb-underline--active']
    .filter(Boolean)
    .join(' ')

// The layer covers the visible part of the field and clips to it, so text scrolled out of view shows no underline.
export const createUnderlineLayer = (parent) => {
  const layer = createElement('div', { className: 'wb-underlines', attributes: { hidden: '' } })
  parent.append(layer)

  const render = (box, marks) => {
    const lines = marks.flatMap((mark) => mark.rects.map((rect) => ({ rect, className: getUnderlineClass(mark) })))
    while (layer.children.length < lines.length) layer.append(createElement('div'))
    while (layer.children.length > lines.length) layer.lastChild.remove()

    layer.hidden = false
    layer.style.transform = `translate(${box.left}px, ${box.top}px)`
    layer.style.width = `${box.right - box.left}px`
    layer.style.height = `${box.bottom - box.top}px`
    lines.forEach(({ rect, className }, index) => {
      const line = layer.children[index]
      line.className = className
      line.style.width = `${rect.width}px`
      line.style.transform = `translate(${rect.left - box.left}px, ${rect.bottom - box.top - UNDERLINE_THICKNESS}px)`
    })
  }

  const hide = () => {
    layer.hidden = true
  }

  return { render, hide }
}
