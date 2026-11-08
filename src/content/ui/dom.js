// Text always goes in through textContent, so nothing from the page can ever be parsed as HTML here.
export const createElement = (tag, { className, text, attributes = {}, onClick } = {}, children = []) => {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value))
  if (onClick) element.addEventListener('click', onClick)
  element.append(...children)
  return element
}

// Pressing the mouse on these controls must leave focus and the caret in the user's field.
export const keepFocusOnMouseDown = (element) => element.addEventListener('mousedown', (event) => event.preventDefault())
