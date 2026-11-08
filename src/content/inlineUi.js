import { createInlineSuggestionManager } from './inlineSuggestionManager.js'

// Injected into the same isolated world as the content script, so this global is invisible to the page.
globalThis.writeBetterInlineUi = createInlineSuggestionManager()
