import { EN_DICTIONARY } from '../engines/spelling/dictionary.js'
import { createSpellChecker } from '../engines/spelling/spellChecker.js'
import { getAiSettings, isAiConfigured } from '../services/aiSettings.js'
import { createCorrectionPipeline } from '../services/correctionPipeline.js'
import { injectIntoOpenTabs, syncCustomSiteScripts } from '../services/customSiteScripts.js'
import { addIgnoredWord, getIgnoredWords } from '../services/ignoredWords.js'
import { createInlineCheckRunner } from '../services/inlineCheckRunner.js'
import { createLatestRunner } from '../services/latestRunner.js'
import { COMMAND_MESSAGES, MESSAGE_TYPES, getSenderKey } from '../services/messaging.js'
import { getSettings, onSettingsChanged } from '../services/settings.js'
import { createWritingEnhancer } from '../services/writingEnhancer.js'
import { UserFacingError } from '../utils/errors.js'
import { lookup } from '../utils/lookup.js'

const LANGUAGE_TOOL_OPTIONS = { serverUrl: 'http://localhost:8081', language: 'en-US' }
const ONLINE_LANGUAGE_TOOL_OPTIONS = {
  serverUrl: 'https://api.languagetool.org',
  language: 'en-US',
  unreachableMessage: 'Could not reach LanguageTool online. Check your internet connection.',
}

let spellChecker = null
// Building the dictionary takes a moment, so it happens on first use rather than on every service worker start.
const getSpellChecker = () => (spellChecker ??= createSpellChecker(EN_DICTIONARY))

const runCorrectionPipeline = createCorrectionPipeline({
  getSpellChecker,
  getIgnoredWords,
  getSettings,
  languageToolOptions: LANGUAGE_TOOL_OPTIONS,
  onlineLanguageToolOptions: ONLINE_LANGUAGE_TOOL_OPTIONS,
})

const inlineChecks = createInlineCheckRunner(runCorrectionPipeline)

// AI rewrites only run from here, on an explicit request from the popup or the Ctrl+Shift+Space shortcut; the key is
// read at request time.
const rewriteWithAi = createWritingEnhancer({ getAiSettings })
const rewrites = createLatestRunner((signal, request) => rewriteWithAi({ ...request, signal }))

// Each popup also names itself, so two popups open in two windows never replace or cancel each other's request.
const getRewriteKey = (sender, payload) => `${getSenderKey(sender)}#${typeof payload?.clientId === 'string' ? payload.clientId : ''}`

const MESSAGE_HANDLERS = {
  // The popup shows a way to set up AI rewriting while there is no key, so it learns that with its first message.
  // Best effort: a failing settings read must not make the popup think the background service is gone.
  [MESSAGE_TYPES.ping]: async () => ({
    version: chrome.runtime.getManifest().version,
    isAiConfigured: await getAiSettings().then(isAiConfigured).catch(() => null),
  }),
  [MESSAGE_TYPES.runCorrection]: (payload) => runCorrectionPipeline(payload),
  [MESSAGE_TYPES.runInlineCheck]: (payload, sender) => inlineChecks.run(getSenderKey(sender), payload?.text),
  [MESSAGE_TYPES.cancelInlineCheck]: (_payload, sender) => inlineChecks.cancel(getSenderKey(sender)),
  [MESSAGE_TYPES.ignoreWord]: (payload) => addIgnoredWord(payload?.word),
  [MESSAGE_TYPES.runRewrite]: (payload, sender) => rewrites.run(getRewriteKey(sender, payload), { text: payload?.text, style: payload?.style }),
  [MESSAGE_TYPES.cancelRewrite]: (payload, sender) => rewrites.cancel(getRewriteKey(sender, payload)),
  [MESSAGE_TYPES.loadInlineUi]: async (_payload, { tab, frameId }) => {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId] }, files: ['inlineUi.js'] })
  },
}

// Changes are queued, because two running at once would both try to register the same script.
let siteSync = Promise.resolve()
const queueSiteSync = (settings) => {
  siteSync = siteSync.then(() => syncCustomSiteScripts(settings)).catch((error) => console.error('[WriteBetter] Could not update site scripts', error))
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings()
  queueSiteSync(settings)
  await injectIntoOpenTabs(settings).catch((error) => console.error('[WriteBetter] Could not start in open tabs', error))
})

onSettingsChanged((settings, previous) => {
  if (settings.customSites.join() !== previous.customSites.join()) queueSiteSync(settings)
})

chrome.commands.onCommand.addListener((command, tab) => {
  const type = lookup(COMMAND_MESSAGES, command)
  if (!type || !tab?.id) return
  // Tabs without a supported site have no content script to answer.
  chrome.tabs.sendMessage(tab.id, { type }).catch(() => {})
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = lookup(MESSAGE_HANDLERS, message?.type)
  if (!handleMessage) return false

  Promise.resolve()
    .then(() => handleMessage(message.payload, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      if (!(error instanceof UserFacingError)) console.error(`[WriteBetter] ${message.type} failed`, error)
      sendResponse({
        ok: false,
        error: error instanceof UserFacingError ? error.message : 'Something went wrong in the background service.',
      })
    })

  // Returning true keeps the message channel open until sendResponse runs asynchronously.
  return true
})
