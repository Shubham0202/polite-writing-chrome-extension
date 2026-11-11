import { DEFAULT_SETTINGS, type Settings } from '../constants/settings.ts'
import { MESSAGE_TYPES, sendMessage, type CommandMessageType } from '../services/messaging.ts'
import { getSettings, isAssistanceActive, onSettingsChanged, updateSettings } from '../services/settings.ts'
import { getDefaultShortcuts } from '../services/shortcuts.ts'
import { watchTheme } from '../services/theme.ts'
import { lookup } from '../utils/lookup.ts'
import { createInputFieldObserver } from './inputFieldObserver.ts'
import { createLazyInlineSuggestions } from './lazyInlineSuggestions.ts'
import { matchesShortcut } from './shortcutFallback.ts'
import { getPageHostname, getSiteAdapter } from './siteAdapters.ts'
import { createTextChangeDetector } from './textChangeDetector.ts'
import { createTextChecker } from './textChecker.ts'

declare global {
  var writeBetterStarted: boolean | undefined
}

type ToggleSettingKey = 'isAiShortcutEnabled' | 'isCloseOnAcceptEnabled'

const CHECK_SETTINGS: (keyof Settings)[] = ['isSpellingEnabled', 'isGrammarEnabled', 'isPoliteEnabled', 'isProfessionalEnabled']

let settings = DEFAULT_SETTINGS

const inlineSuggestions = createLazyInlineSuggestions()

const setTheme = watchTheme(inlineSuggestions.setColorScheme)

const checkText = createTextChecker({
  onResult: (result) => inlineSuggestions.showResult(result),
  onEmpty: () => inlineSuggestions.clear(),
  onRejected: (reason) => inlineSuggestions.showNotice(reason),
  onDisconnected: () => inputFieldObserver.stop(),
})

const textChangeDetector = createTextChangeDetector({
  onTextReady: checkText,
  onTextChanged: inlineSuggestions.handleTextChanged,
  getDelayMs: () => settings.delayMs,
})

const inputFieldObserver = createInputFieldObserver({
  isOwnElement: inlineSuggestions.isOwnElement,
  siteAdapter: getSiteAdapter(getPageHostname()),
  onFieldActivated: (field, kind) => {
    inlineSuggestions.attach(field, kind)
    textChangeDetector.watch(field, kind)
  },
  onFieldDeactivated: () => {
    textChangeDetector.unwatch()
    inlineSuggestions.detach()
  },
  onStopped: inlineSuggestions.destroy,
})

// The switches in the suggestion list are the ones in Settings; flipping either changes the stored setting.
const toggleSetting = (key: ToggleSettingKey) => () => updateSettings({ [key]: !settings[key] }).catch(() => {})
const toggleAiShortcut = toggleSetting('isAiShortcutEnabled')
const toggleCloseOnAccept = toggleSetting('isCloseOnAcceptEnabled')

// While paused the page has no listeners at all: nothing is watched, rather than being watched and ignored.
const applySettings = (newSettings: Settings): void => {
  settings = newSettings
  inlineSuggestions.setAiShortcut({ isEnabled: settings.isAiShortcutEnabled, style: settings.aiShortcutStyle, onToggle: toggleAiShortcut })
  inlineSuggestions.setCloseOnAccept({ isEnabled: settings.isCloseOnAcceptEnabled, onToggle: toggleCloseOnAccept })
  setTheme(settings.theme)
  if (isAssistanceActive(settings, getPageHostname())) inputFieldObserver.start()
  else inputFieldObserver.stop()
}

const handleSettingsChanged = (newSettings: Settings, previous: Settings): void => {
  applySettings(newSettings)
  if (CHECK_SETTINGS.some((key) => newSettings[key] !== previous[key])) textChangeDetector.recheck()
}

// What each keyboard shortcut, relayed by the service worker, asks the page to do.
const SHORTCUT_HANDLERS: Record<CommandMessageType, () => void> = {
  [MESSAGE_TYPES.openSuggestion]: () => inlineSuggestions.openFromKeyboard(),
  [MESSAGE_TYPES.openAllSuggestions]: () => inlineSuggestions.openAllFromKeyboard(),
}

const DEFAULT_SHORTCUTS = getDefaultShortcuts()
const IS_MAC = navigator.userAgent.includes('Mac')

// Chrome leaves a shortcut unset when another extension in the profile already had its key, so the page reports the
// default keys too; the service worker acts on them only while the shortcut is unset, so a press never counts twice.
// Key presses a page makes up are ignored, because the shortcut can send the field's text to the AI provider.
const handleShortcutFallback = (event: KeyboardEvent) => {
  if (!event.isTrusted || event.repeat) return
  const match = DEFAULT_SHORTCUTS.find(({ shortcut }) => matchesShortcut(event, shortcut, IS_MAC))
  if (match) sendMessage(MESSAGE_TYPES.runShortcutFallback, { command: match.command }).catch(() => {})
}

// A page can match both the manifest and a site the user added, which would otherwise run this script twice.
if (!globalThis.writeBetterStarted) {
  globalThis.writeBetterStarted = true
  chrome.runtime.onMessage.addListener((message: { type?: unknown } | null | undefined) => {
    lookup(SHORTCUT_HANDLERS, message?.type)?.()
  })
  addEventListener('keydown', handleShortcutFallback, true)
  onSettingsChanged(handleSettingsChanged)
  getSettings().then(applySettings)
}
