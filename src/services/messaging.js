export const MESSAGE_TYPES = Object.freeze({
  ping: 'PING',
  runCorrection: 'RUN_CORRECTION',
  runInlineCheck: 'RUN_INLINE_CHECK',
  cancelInlineCheck: 'CANCEL_INLINE_CHECK',
  openSuggestion: 'OPEN_SUGGESTION',
  openAllSuggestions: 'OPEN_ALL_SUGGESTIONS',
  ignoreWord: 'IGNORE_WORD',
  loadInlineUi: 'LOAD_INLINE_UI',
  runRewrite: 'RUN_REWRITE',
  cancelRewrite: 'CANCEL_REWRITE',
})

// The keyboard shortcuts in manifest.json "commands", and what each one asks the page to do.
export const COMMAND_MESSAGES = Object.freeze({
  'open-suggestion': MESSAGE_TYPES.openSuggestion,
  'open-all-suggestions': MESSAGE_TYPES.openAllSuggestions,
})

const EXTENSION_PAGE_KEY = 'extension-page'

const getExtensionPagePath = (sender) => {
  try {
    return new URL(sender?.url).pathname
  } catch {
    return EXTENSION_PAGE_KEY
  }
}

// Names who sent a message, so that a newer request replaces only that sender's older one. Each frame of a tab has
// its own key, so typing in one tab never cancels a check in another. The popup and the settings page have no tab;
// their page path tells them apart, and a reopened popup takes over from the one that was closed.
export const getSenderKey = (sender) => (sender?.tab ? `${sender.tab.id}:${sender.frameId}` : getExtensionPagePath(sender))

export const SENDER_ROLES = Object.freeze({
  extensionPage: 'extension-page',
  contentScript: 'content-script',
})

// Settings opens in a tab, so a tab alone does not mean a content script: extension pages load from the extension's
// own address, while a content script reports the web page it runs in.
export const getSenderRole = (sender, extensionUrl) => {
  if (sender?.url?.startsWith(extensionUrl)) return SENDER_ROLES.extensionPage
  return sender?.tab ? SENDER_ROLES.contentScript : null
}

const sendRuntimeMessage = async (message) => {
  try {
    return await chrome.runtime.sendMessage(message)
  } catch {
    throw new Error('The background service is not available. Close and reopen the popup to try again.')
  }
}

export const sendMessage = async (type, payload) => {
  const response = await sendRuntimeMessage({ type, payload })

  if (!response?.ok) {
    throw new Error(response?.error ?? 'The background service did not respond.')
  }

  return response.data
}
