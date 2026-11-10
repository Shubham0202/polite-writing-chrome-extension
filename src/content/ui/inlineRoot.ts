import inlineStyles from '../inline.css?inline'
import { createElement } from './dom.ts'

// Inline and important, so a site's own rules cannot hide or move the element that holds the UI.
const HOST_STYLE =
  'all: initial !important; display: block !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;'

const TOP_LAYER_SELECTOR = 'dialog:modal, [popover]:popover-open'

const findMountParent = (field: HTMLElement): Element => {
  for (let element: Element | null = field; element; element = element.parentElement ?? (element.getRootNode() as ShadowRoot).host) {
    if (element.matches(TOP_LAYER_SELECTOR)) return element
  }
  return document.documentElement
}

export interface InlineRoot {
  host: HTMLElement
  shadowRoot: ShadowRoot
  mirror: HTMLElement
  status: HTMLElement
  mountFor: (field: HTMLElement) => void
}

// One closed shadow root per page: site CSS cannot reach in, and site scripts cannot read the text shown inside.
export const createInlineRoot = (): InlineRoot => {
  const host = document.createElement('writebetter-root')
  host.style.cssText = HOST_STYLE
  const shadowRoot = host.attachShadow({ mode: 'closed' })
  const mirror = createElement('div', { className: 'wb-mirror', attributes: { 'aria-hidden': 'true' } })
  const status = createElement('div', { className: 'wb-status', attributes: { role: 'status', 'aria-live': 'polite' } })

  shadowRoot.append(createElement('style', { text: inlineStyles }), mirror, status)

  // A modal dialog covers the page and makes the rest of it inert, so the UI has to live inside it to be seen and used.
  const mountFor = (field: HTMLElement) => {
    const parent = findMountParent(field)
    if (host.parentNode !== parent) parent.append(host)

    // A transformed ancestor becomes the origin of fixed positioning; the UI works in viewport coordinates.
    host.style.setProperty('translate', 'none', 'important')
    const { left, top } = host.getBoundingClientRect()
    host.style.setProperty('translate', `${-left}px ${-top}px`, 'important')
  }

  return { host, shadowRoot, mirror, status, mountFor }
}
