export type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>

export interface ElementOptions {
  className?: string
  text?: string
  attributes?: Record<string, string>
  onClick?: (event: MouseEvent) => void
}

// Text always goes in through textContent, so nothing from the page can ever be parsed as HTML here.
export const createElement = (
  tag: keyof HTMLElementTagNameMap,
  { className, text, attributes = {}, onClick }: ElementOptions = {},
  children: readonly (Node | string)[] = [],
): HTMLElement => {
  const element: HTMLElement = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value))
  if (onClick) element.addEventListener('click', onClick)
  element.append(...children)
  return element
}

// Pressing the mouse on these controls must leave focus and the caret in the user's field.
export const keepFocusOnMouseDown = (element: HTMLElement): void => element.addEventListener('mousedown', (event) => event.preventDefault())
