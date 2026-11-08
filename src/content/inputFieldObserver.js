import { getFieldSupport } from './fieldEligibility.js'

export const DEACTIVATION_REASONS = Object.freeze({
  blur: 'blur',
  removed: 'removed',
  stopped: 'stopped',
})

// Focus events cross shadow boundaries retargeted to the host; the composed path still starts at the real target.
const getEventTarget = (event) => event.composedPath()[0]

const getDeepActiveElement = () => {
  let element = document.activeElement
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement
  return element
}

// Watches one field at a time: the supported field that has focus. Fields added later need no DOM scan,
// because they are picked up when they receive focus.
export const createInputFieldObserver = ({ onFieldActivated, onFieldDeactivated, onFieldSkipped, onStopped, isOwnElement, siteAdapter }) => {
  let listeners = null
  let activeField = null
  let removalObserver = null

  const deactivate = (reason) => {
    if (!activeField) return
    const field = activeField
    activeField = null
    removalObserver.disconnect()
    removalObserver = null
    onFieldDeactivated(field, reason)
  }

  const activate = ({ field, kind }) => {
    activeField = field
    // Chrome fires focusout when a focused field is removed, but the HTML spec does not require it and pages can
    // swallow it. A removed element reports a 0×0 size, so this notices removal without observing the whole document.
    removalObserver = new ResizeObserver(() => {
      if (!field.isConnected) deactivate(DEACTIVATION_REASONS.removed)
    })
    removalObserver.observe(field)
    onFieldActivated(field, kind)
  }

  const listenForFocus = (target) => {
    const options = { capture: true, signal: listeners.signal }
    target.addEventListener('focusin', handleFocusIn, options)
    target.addEventListener('focusout', handleFocusOut, options)
  }

  // Focus moving between two elements of one shadow tree never leaves that tree, so the document cannot see it.
  const inspect = (element) => {
    if (element?.getRootNode() instanceof ShadowRoot) listenForFocus(element.getRootNode())

    const support = getFieldSupport(element, siteAdapter)
    if (!support || support.field === activeField) return

    deactivate(DEACTIVATION_REASONS.blur)
    if (support.skipReason) onFieldSkipped(support.field, support.skipReason)
    else activate(support)
  }

  const stop = () => {
    listeners?.abort()
    listeners = null
    deactivate(DEACTIVATION_REASONS.stopped)
    onStopped?.()
  }

  const handleFocusIn = (event) => {
    // After the extension is reloaded or removed, this copy of the script is cut off from it and must go quiet.
    if (!chrome.runtime?.id) return stop()
    inspect(getEventTarget(event))
  }

  const handleFocusOut = (event) => {
    // Keyboard users move into the suggestion card and come back, so the field is still the one being worked on.
    if (isOwnElement?.(event.relatedTarget)) return
    if (activeField?.contains(getEventTarget(event))) deactivate(DEACTIVATION_REASONS.blur)
  }

  const start = () => {
    if (listeners) return
    listeners = new AbortController()
    listenForFocus(document)
    // A field focused before the script loaded (autofocus) fires no focusin. Without document focus, activeElement
    // is only the <body>, which an editable iframe would wrongly report as a focused field.
    if (document.hasFocus()) inspect(getDeepActiveElement())
  }

  return { start, stop }
}
