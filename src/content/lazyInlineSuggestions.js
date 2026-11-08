import { MESSAGE_TYPES, sendMessage } from '../services/messaging.js'

const hasSomethingToShow = ({ suggestions, toneAlternatives }) =>
  suggestions.length > 0 || Object.values(toneAlternatives).some((rewrites) => rewrites.length > 0)

// Stands in for the suggestion manager, which is only injected once there is something to show, so pages where the
// user just reads never load it. Before that, there is nothing on the page for the other calls to act on.
export const createLazyInlineSuggestions = ({ onUnavailable }) => {
  let manager = null
  let loading = null
  let activeField = null
  let aiShortcut = null
  let closeOnAccept = null

  const load = () => {
    loading ??= sendMessage(MESSAGE_TYPES.loadInlineUi).then(() => {
      manager = globalThis.writeBetterInlineUi
      if (aiShortcut) manager.setAiShortcut(aiShortcut)
      if (closeOnAccept) manager.setCloseOnAccept(closeOnAccept)
      if (activeField) manager.attach(activeField.field, activeField.kind)
      return manager
    })
    return loading.catch((error) => {
      loading = null
      onUnavailable(error.message)
      return null
    })
  }

  return {
    attach: (field, kind) => {
      activeField = { field, kind }
      manager?.attach(field, kind)
    },
    detach: () => {
      activeField = null
      manager?.detach()
    },
    showResult: async (result) => {
      if (!manager && !hasSomethingToShow(result)) return
      ;(await load())?.showResult(result)
    },
    showNotice: async (message) => (await load())?.showNotice(message),
    clear: () => manager?.clear(),
    destroy: () => manager?.destroy(),
    handleTextChanged: () => manager?.handleTextChanged(),
    openFromKeyboard: () => manager?.openFromKeyboard(),
    // With AI rewriting on, the shortcut has work to do in a field even before any suggestion was shown there.
    openAllFromKeyboard: async () => {
      if (!manager && !(aiShortcut?.isEnabled && activeField)) return
      ;(await load())?.openAllFromKeyboard()
    },
    setAiShortcut: (config) => {
      aiShortcut = config
      manager?.setAiShortcut(config)
    },
    setCloseOnAccept: (config) => {
      closeOnAccept = config
      manager?.setCloseOnAccept(config)
    },
    isOwnElement: (element) => manager?.isOwnElement(element) ?? false,
  }
}
