import { ENGINE_STATUS } from '../constants/corrections.ts'
import { DEFAULT_SETTINGS, TOGGLE_SETTING_KEYS, type Settings, type ToggleSettingKey } from '../constants/settings.ts'
import type { InlineCheckResult } from '../services/correctionPipeline.ts'
import { MESSAGE_TYPES, sendMessage, type PageMessage, type PageMessageType } from '../services/messaging.ts'
import { isAssistanceActive } from '../services/settings.ts'
import { getDefaultShortcuts } from '../services/shortcuts.ts'
import { watchTheme } from '../services/theme.ts'
import { devLog, type LogDetails } from '../utils/devLog.ts'
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

const CHECK_SETTINGS: (keyof Settings)[] = ['isSpellingEnabled', 'isGrammarEnabled', 'isPoliteEnabled', 'isProfessionalEnabled']

// Which engines found something and which did not run, never what they found.
const summarizeResult = ({ suggestions, toneAlternatives, engines }: InlineCheckResult): LogDetails => ({
  suggestions: suggestions.map(({ engine }) => engine).join(', '),
  toneAlternatives: Object.entries(toneAlternatives).map(([tone, alternatives]) => `${tone}: ${alternatives.length}`).join(', '),
  engines: engines.filter(({ status }) => status !== ENGINE_STATUS.used).map(({ label, status }) => `${label}: ${status}`).join(', '),
})

let settings = DEFAULT_SETTINGS

const inlineSuggestions = createLazyInlineSuggestions({
  onUnavailable: (reason) => devLog('Suggestions unavailable', () => ({ reason })),
})

const setTheme = watchTheme(inlineSuggestions.setColorScheme)

const checkText = createTextChecker({
  onResult: (result) => {
    devLog('Check finished', () => summarizeResult(result))
    inlineSuggestions.showResult(result)
  },
  onEmpty: () => {
    devLog('Check skipped: no text')
    inlineSuggestions.clear()
  },
  onRejected: (reason) => {
    devLog('Check skipped', () => ({ reason }))
    inlineSuggestions.showNotice(reason)
  },
  onFailed: (reason) => devLog('Check failed', () => ({ reason })),
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
    devLog('Watching field', () => ({ kind }))
    inlineSuggestions.attach(field, kind)
    textChangeDetector.watch(field, kind)
  },
  onFieldDeactivated: (_field, reason) => {
    textChangeDetector.unwatch()
    inlineSuggestions.detach()
    devLog('Stopped watching field', () => ({ reason }))
  },
  onStopped: inlineSuggestions.destroy,
})

// The switches in the suggestion list are the ones in Settings; flipping either changes the stored setting.
const toggleSetting = (key: ToggleSettingKey) => () => sendMessage(MESSAGE_TYPES.setToggleSetting, { key, isEnabled: !settings[key] }).catch(() => {})
const toggleAiShortcut = toggleSetting(TOGGLE_SETTING_KEYS.aiShortcut)
const toggleCloseOnAccept = toggleSetting(TOGGLE_SETTING_KEYS.closeOnAccept)

// While paused the page has no listeners at all: nothing is watched, rather than being watched and ignored.
const applySettings = (newSettings: Settings): void => {
  settings = newSettings
  inlineSuggestions.setAiShortcut({ isEnabled: settings.isAiShortcutEnabled, style: settings.aiShortcutStyle, onToggle: toggleAiShortcut })
  inlineSuggestions.setCloseOnAccept({ isEnabled: settings.isCloseOnAcceptEnabled, onToggle: toggleCloseOnAccept })
  setTheme(settings.theme)
  if (isAssistanceActive(settings, getPageHostname())) inputFieldObserver.start()
  else inputFieldObserver.stop()
}

const handleSettingsChanged = (newSettings: Settings): void => {
  const previous = settings
  applySettings(newSettings)
  if (CHECK_SETTINGS.some((key) => newSettings[key] !== previous[key])) textChangeDetector.recheck()
}

// Counts the changes the service worker sent, so the answer to an earlier request never undoes a newer change.
let settingsChangeCount = 0

// Content scripts cannot read storage, so they ask the service worker. Without settings nothing is watched, so a
// failed request leaves the page as it was.
const requestSettings = (onSettings: (settings: Settings) => void): void => {
  const changeCountAtRequest = settingsChangeCount
  sendMessage(MESSAGE_TYPES.getSettings)
    .then((newSettings) => {
      if (settingsChangeCount === changeCountAtRequest) onSettings(newSettings)
    })
    .catch((error: Error) => devLog('Settings unavailable', () => ({ reason: error.message })))
}

// What each message from the service worker asks the page to do: a relayed keyboard shortcut, or new settings.
const PAGE_MESSAGE_HANDLERS: Record<PageMessageType, (payload: PageMessage['payload']) => void> = {
  [MESSAGE_TYPES.openSuggestion]: () => inlineSuggestions.openFromKeyboard(),
  [MESSAGE_TYPES.openAllSuggestions]: () => inlineSuggestions.openAllFromKeyboard(),
  [MESSAGE_TYPES.settingsChanged]: (payload) => {
    if (!payload?.settings) return
    settingsChangeCount += 1
    handleSettingsChanged(payload.settings)
  },
}

// The service worker only reaches the page a tab is showing. A page restored from the back/forward cache, or shown after
// being prerendered, missed the changes made meanwhile.
const handlePageShow = (event: PageTransitionEvent) => {
  if (event.persisted) requestSettings(handleSettingsChanged)
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
  chrome.runtime.onMessage.addListener((message: Partial<PageMessage> | null | undefined) => {
    lookup(PAGE_MESSAGE_HANDLERS, message?.type)?.(message?.payload)
  })
  addEventListener('keydown', handleShortcutFallback, true)
  addEventListener('pageshow', handlePageShow)
  document.addEventListener('prerenderingchange', () => requestSettings(handleSettingsChanged))
  requestSettings(applySettings)
}
