import { createInlineSuggestionManager, type InlineSuggestionManager } from './inlineSuggestionManager.ts'

declare global {
  var writeBetterInlineUi: InlineSuggestionManager | undefined
}

// Injected into the same isolated world as the content script, so this global is invisible to the page.
globalThis.writeBetterInlineUi = createInlineSuggestionManager()
