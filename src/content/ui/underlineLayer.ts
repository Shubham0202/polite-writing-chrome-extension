import { CONFIDENCE, ENGINES, type Engine } from '../../constants/corrections.ts'
import type { IdentifiedSuggestion } from '../../engines/suggestion.ts'
import { createElement, type Box } from './dom.ts'

const ENGINE_CLASS: Partial<Record<Engine, string>> = {
  [ENGINES.spelling]: 'wb-underline--spelling',
  [ENGINES.grammar]: 'wb-underline--grammar',
  [ENGINES.tense]: 'wb-underline--tense',
  [ENGINES.tone]: 'wb-underline--tone',
}
const UNDERLINE_THICKNESS = 2

export interface UnderlineMark {
  suggestion: IdentifiedSuggestion
  rects: readonly Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>[]
  isActive: boolean
}

export interface UnderlineLayer {
  render: (box: Box, marks: readonly UnderlineMark[]) => void
  hide: () => void
}

const getUnderlineClass = ({ suggestion, isActive }: UnderlineMark) =>
  ['wb-underline', ENGINE_CLASS[suggestion.engine], suggestion.confidence === CONFIDENCE.low && 'wb-underline--uncertain', isActive && 'wb-underline--active']
    .filter(Boolean)
    .join(' ')

// The layer covers the visible part of the field and clips to it, so text scrolled out of view shows no underline.
export const createUnderlineLayer = (parent: ParentNode): UnderlineLayer => {
  const layer = createElement('div', { className: 'wb-underlines', attributes: { hidden: '' } })
  parent.append(layer)

  const render = (box: Box, marks: readonly UnderlineMark[]) => {
    const lines = marks.flatMap((mark) => mark.rects.map((rect) => ({ rect, className: getUnderlineClass(mark) })))
    while (layer.children.length < lines.length) layer.append(createElement('div'))
    while (layer.children.length > lines.length) layer.lastChild!.remove()

    layer.hidden = false
    layer.style.transform = `translate(${box.left}px, ${box.top}px)`
    layer.style.width = `${box.right - box.left}px`
    layer.style.height = `${box.bottom - box.top}px`
    lines.forEach(({ rect, className }, index) => {
      const line = layer.children[index] as HTMLElement
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
