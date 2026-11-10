import type { InlineCheckResult } from '../services/correctionPipeline.ts'
import { MESSAGE_TYPES, sendMessage } from '../services/messaging.ts'
import type { ColorScheme } from '../services/theme.ts'
import type { FieldKind } from './fieldEligibility.ts'
// Declares the writeBetterInlineUi global read below; type-only, so the UI is still injected on demand, not bundled here.
import type {} from './inlineUi.ts'
import type { AiShortcutConfig, InlineSuggestionManager } from './inlineSuggestionManager.ts'
import type { ToggleSetting } from './ui/suggestionCard.ts'

interface ActiveField {
  field: HTMLElement
  kind: FieldKind
}

export interface LazyInlineSuggestionsOptions {
  onUnavailable: (reason: string) => void
}

export interface LazyInlineSuggestions {
  attach: (field: HTMLElement, kind: FieldKind) => void
  detach: () => void
  showResult: (result: InlineCheckResult) => Promise<void>
  showNotice: (message: string) => Promise<void>
  clear: () => void
  destroy: () => void
  handleTextChanged: () => void
  openFromKeyboard: () => void
  openAllFromKeyboard: () => Promise<void>
  setAiShortcut: (config: AiShortcutConfig) => void
  setCloseOnAccept: (config: ToggleSetting) => void
  setColorScheme: (colorScheme: ColorScheme) => void
  isOwnElement: (element: Node | null) => boolean
}

const hasSomethingToShow = ({ suggestions, toneAlternatives }: InlineCheckResult): boolean =>
  suggestions.length > 0 || Object.values(toneAlternatives).some((rewrites) => rewrites.length > 0)

// Stands in for the suggestion manager, which is only injected once there is something to show, so pages where the
// user just reads never load it. Before that, there is nothing on the page for the other calls to act on.
export const createLazyInlineSuggestions = ({ onUnavailable }: LazyInlineSuggestionsOptions): LazyInlineSuggestions => {
  let manager: InlineSuggestionManager | null = null
  let loading: Promise<InlineSuggestionManager> | null = null
  let activeField: ActiveField | null = null
  let aiShortcut: AiShortcutConfig | null = null
  let closeOnAccept: ToggleSetting | null = null
  let colorScheme: ColorScheme | null = null

  const load = (): Promise<InlineSuggestionManager | null> => {
    loading ??= sendMessage(MESSAGE_TYPES.loadInlineUi).then(() => {
      manager = globalThis.writeBetterInlineUi!
      if (aiShortcut) manager.setAiShortcut(aiShortcut)
      if (closeOnAccept) manager.setCloseOnAccept(closeOnAccept)
      if (colorScheme) manager.setColorScheme(colorScheme)
      if (activeField) manager.attach(activeField.field, activeField.kind)
      return manager
    })
    return loading.catch((error: Error) => {
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
    setColorScheme: (newColorScheme) => {
      colorScheme = newColorScheme
      manager?.setColorScheme(newColorScheme)
    },
    isOwnElement: (element) => manager?.isOwnElement(element) ?? false,
  }
}
