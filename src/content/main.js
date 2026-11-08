import { ENGINE_STATUS } from '../constants/corrections.js'
import { DEFAULT_SETTINGS } from '../constants/settings.js'
import { MESSAGE_TYPES } from '../services/messaging.js'
import { getSettings, isAssistanceActive, onSettingsChanged, updateSettings } from '../services/settings.js'
import { lookup } from '../utils/lookup.js'
import { createInputFieldObserver } from './inputFieldObserver.js'
import { createLazyInlineSuggestions } from './lazyInlineSuggestions.js'
import { getPageHostname, getSiteAdapter } from './siteAdapters.js'
import { createTextChangeDetector } from './textChangeDetector.js'
import { createTextChecker } from './textChecker.js'

const CHECK_SETTINGS = ['isSpellingEnabled', 'isGrammarEnabled', 'isPoliteEnabled', 'isProfessionalEnabled']

// Reported at the debug level (DevTools "Verbose") to help check real sites. Reports never include the user's text.
const log = (message, ...details) => console.debug(`[WriteBetter] ${message}`, ...details)

const summarizeResult = ({ suggestions, toneAlternatives, engines }) =>
  JSON.stringify({
    suggestions: suggestions.map(({ engine }) => engine),
    toneAlternatives: Object.entries(toneAlternatives).map(([tone, alternatives]) => `${tone}: ${alternatives.length}`),
    engines: engines.filter(({ status }) => status !== ENGINE_STATUS.used).map(({ label, status }) => `${label}: ${status}`),
  })

let settings = DEFAULT_SETTINGS

const inlineSuggestions = createLazyInlineSuggestions({
  onUnavailable: (reason) => log(`Suggestions unavailable: ${reason}`),
})

const checkText = createTextChecker({
  onResult: (result) => {
    log(`Check finished: ${summarizeResult(result)}`)
    inlineSuggestions.showResult(result)
  },
  onEmpty: () => {
    log('Check skipped: no text')
    inlineSuggestions.clear()
  },
  onRejected: (reason) => {
    log(`Check skipped: ${reason}`)
    inlineSuggestions.showNotice(reason)
  },
  onFailed: (reason) => log(`Check failed: ${reason}`),
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
    log(`Watching ${kind} field`, field)
    inlineSuggestions.attach(field, kind)
    textChangeDetector.watch(field, kind)
  },
  onFieldDeactivated: (field, reason) => {
    textChangeDetector.unwatch()
    inlineSuggestions.detach()
    log(`Stopped watching field (${reason})`, field)
  },
  onFieldSkipped: (field, reason) => log(`Skipped field (${reason})`, field),
  onStopped: inlineSuggestions.destroy,
})

// The switches in the suggestion list are the ones in Settings; flipping either changes the stored setting.
const toggleSetting = (key) => () => updateSettings({ [key]: !settings[key] }).catch(() => {})
const toggleAiShortcut = toggleSetting('isAiShortcutEnabled')
const toggleCloseOnAccept = toggleSetting('isCloseOnAcceptEnabled')

// While paused the page has no listeners at all: nothing is watched, rather than being watched and ignored.
const applySettings = (newSettings) => {
  settings = newSettings
  inlineSuggestions.setAiShortcut({ isEnabled: settings.isAiShortcutEnabled, style: settings.aiShortcutStyle, onToggle: toggleAiShortcut })
  inlineSuggestions.setCloseOnAccept({ isEnabled: settings.isCloseOnAcceptEnabled, onToggle: toggleCloseOnAccept })
  if (isAssistanceActive(settings, getPageHostname())) inputFieldObserver.start()
  else inputFieldObserver.stop()
}

const handleSettingsChanged = (newSettings, previous) => {
  applySettings(newSettings)
  if (CHECK_SETTINGS.some((key) => newSettings[key] !== previous[key])) textChangeDetector.recheck()
}

// What each keyboard shortcut, relayed by the service worker, asks the page to do.
const SHORTCUT_HANDLERS = {
  [MESSAGE_TYPES.openSuggestion]: () => inlineSuggestions.openFromKeyboard(),
  [MESSAGE_TYPES.openAllSuggestions]: () => inlineSuggestions.openAllFromKeyboard(),
}

// A page can match both the manifest and a site the user added, which would otherwise run this script twice.
if (!globalThis.writeBetterStarted) {
  globalThis.writeBetterStarted = true
  chrome.runtime.onMessage.addListener((message) => {
    lookup(SHORTCUT_HANDLERS, message?.type)?.()
  })
  onSettingsChanged(handleSettingsChanged)
  getSettings().then(applySettings)
}
