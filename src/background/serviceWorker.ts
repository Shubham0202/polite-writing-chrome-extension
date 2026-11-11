import { LOCAL_LANGUAGE_TOOL, type Settings } from '../constants/settings.ts'
import { EN_DICTIONARY } from '../engines/spelling/dictionary.ts'
import { createSpellChecker, type SpellChecker } from '../engines/spelling/spellChecker.ts'
import { getActiveKeySlot, getAiSettings, isAiConfigured, setActiveKeySlot } from '../services/aiSettings.ts'
import { createCorrectionPipeline, type CorrectionRequest } from '../services/correctionPipeline.ts'
import { injectIntoOpenTabs, syncCustomSiteScripts } from '../services/customSiteScripts.ts'
import { addIgnoredWord, getIgnoredWords } from '../services/ignoredWords.ts'
import { isLocalLanguageToolAllowed } from '../services/localLanguageTool.ts'
import { createInlineCheckRunner } from '../services/inlineCheckRunner.ts'
import { createLatestRunner } from '../services/latestRunner.ts'
import {
  COMMAND_MESSAGES,
  MESSAGE_TYPES,
  SENDER_ROLES,
  getSenderKey,
  getSenderRole,
  type MessageHandlers,
  type MessageResponse,
  type MessagePayload,
  type MessageSenderInfo,
  type RequestMessageType,
  type SenderRole,
} from '../services/messaging.ts'
import { isOnlineGrammarAllowed } from '../services/onlineGrammar.ts'
import { getSettings, onSettingsChanged } from '../services/settings.ts'
import { isShortcutUnset } from '../services/shortcuts.ts'
import { createWritingEnhancer, type RewriteRequest } from '../services/writingEnhancer.ts'
import { UserFacingError } from '../utils/errors.ts'
import { lookup } from '../utils/lookup.ts'

const LANGUAGE_TOOL_OPTIONS = { serverUrl: LOCAL_LANGUAGE_TOOL.serverUrl, language: 'en-US' }
const ONLINE_LANGUAGE_TOOL_OPTIONS = {
  serverUrl: 'https://api.languagetool.org',
  language: 'en-US',
  unreachableMessage: 'Could not reach LanguageTool online. Check your internet connection.',
}

let spellChecker: SpellChecker | null = null
// Building the dictionary takes a moment, so it happens on first use rather than on every service worker start.
const getSpellChecker = () => (spellChecker ??= createSpellChecker(EN_DICTIONARY))

const runCorrectionPipeline = createCorrectionPipeline({
  getSpellChecker,
  getIgnoredWords,
  getSettings,
  languageToolOptions: LANGUAGE_TOOL_OPTIONS,
  onlineLanguageToolOptions: ONLINE_LANGUAGE_TOOL_OPTIONS,
  isLocalLanguageToolAllowed,
})

const inlineChecks = createInlineCheckRunner(runCorrectionPipeline)

// AI rewrites only run from here, on an explicit request from the popup or the Ctrl+Shift+Space shortcut; the key is
// read at request time.
const rewriteWithAi = createWritingEnhancer({ getAiSettings, getActiveKeySlot, setActiveKeySlot })
const rewrites = createLatestRunner((signal: AbortSignal, request: Omit<RewriteRequest, 'signal'>) => rewriteWithAi({ ...request, signal }))

// Each popup also names itself, so two popups open in two windows never replace or cancel each other's request.
const getRewriteKey = (sender: MessageSenderInfo, payload: Partial<MessagePayload<typeof MESSAGE_TYPES.runRewrite>> | undefined) => `${getSenderKey(sender)}#${typeof payload?.clientId === 'string' ? payload.clientId : ''}`

const getRole = (sender: MessageSenderInfo | undefined) => (sender?.id === chrome.runtime.id ? getSenderRole(sender, chrome.runtime.getURL('')) : null)

// Each request is accepted only from the side that really sends it, so a content script that a page managed to take
// over still could not, for example, ask for the online grammar service that only the popup may choose.
const MESSAGE_SENDER_ROLES: Record<RequestMessageType, readonly (SenderRole | null)[]> = {
  [MESSAGE_TYPES.ping]: [SENDER_ROLES.extensionPage],
  [MESSAGE_TYPES.runCorrection]: [SENDER_ROLES.extensionPage],
  [MESSAGE_TYPES.runInlineCheck]: [SENDER_ROLES.contentScript],
  [MESSAGE_TYPES.cancelInlineCheck]: [SENDER_ROLES.contentScript],
  [MESSAGE_TYPES.ignoreWord]: [SENDER_ROLES.contentScript],
  [MESSAGE_TYPES.runRewrite]: [SENDER_ROLES.extensionPage, SENDER_ROLES.contentScript],
  [MESSAGE_TYPES.cancelRewrite]: [SENDER_ROLES.extensionPage, SENDER_ROLES.contentScript],
  [MESSAGE_TYPES.loadInlineUi]: [SENDER_ROLES.contentScript],
  [MESSAGE_TYPES.runShortcutFallback]: [SENDER_ROLES.contentScript],
}

const sendCommandToTab = (command: string, tabId: number | undefined) => {
  const type = lookup(COMMAND_MESSAGES, command)
  if (!type || !tabId) return
  // Tabs without a supported site have no content script to answer.
  chrome.tabs.sendMessage(tabId, { type }).catch(() => {})
}

const isAllowedSender = (type: unknown, sender: MessageSenderInfo | undefined) => lookup(MESSAGE_SENDER_ROLES, type)?.includes(getRole(sender)) ?? false

const MESSAGE_HANDLERS: MessageHandlers = {
  // The popup shows a way to set up AI rewriting while there is no key, so it learns that with its first message.
  // Best effort: a failing settings read must not make the popup think the background service is gone.
  [MESSAGE_TYPES.ping]: async () => ({
    version: chrome.runtime.getManifest().version,
    isAiConfigured: await getAiSettings().then(isAiConfigured).catch(() => null),
  }),
  [MESSAGE_TYPES.runCorrection]: async (payload) =>
    runCorrectionPipeline({ ...payload, isOnlineGrammarEnabled: await isOnlineGrammarAllowed(payload?.isOnlineGrammarEnabled) } as CorrectionRequest),
  [MESSAGE_TYPES.runInlineCheck]: (payload, sender) => inlineChecks.run(getSenderKey(sender), payload?.text as string),
  [MESSAGE_TYPES.cancelInlineCheck]: (_payload, sender) => inlineChecks.cancel(getSenderKey(sender)),
  [MESSAGE_TYPES.ignoreWord]: (payload) => addIgnoredWord(payload?.word),
  [MESSAGE_TYPES.runRewrite]: async (payload, sender) => {
    // On websites the AI is asked only while the shortcut setting is on; the popup has Rewrite buttons of its own.
    if (getRole(sender) === SENDER_ROLES.contentScript && !(await getSettings()).isAiShortcutEnabled) {
      throw new UserFacingError('Rewriting with AI from the keyboard shortcut is turned off in Settings.')
    }
    return rewrites.run(getRewriteKey(sender, payload), { text: payload?.text, style: payload?.style } as Omit<RewriteRequest, 'signal'>)
  },
  [MESSAGE_TYPES.cancelRewrite]: (payload, sender) => rewrites.cancel(getRewriteKey(sender, payload)),
  [MESSAGE_TYPES.loadInlineUi]: async (_payload, { tab, frameId }) => {
    await chrome.scripting.executeScript({ target: { tabId: tab!.id!, frameIds: [frameId!] }, files: ['inlineUi.js'] })
  },
  // While the shortcut has a key, to this one or another, Chrome runs the command itself.
  [MESSAGE_TYPES.runShortcutFallback]: async (payload, { tab }) => {
    if (typeof payload?.command === 'string' && (await isShortcutUnset(payload.command))) sendCommandToTab(payload.command, tab?.id)
  },
}

// Changes are queued, because two running at once would both try to register the same script.
let siteSync = Promise.resolve()
const queueSiteSync = (settings: Settings) => {
  // A failed sync must not stop the ones queued after it; the next change of sites registers them again.
  siteSync = siteSync.then(() => syncCustomSiteScripts(settings)).catch(() => {})
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings()
  queueSiteSync(settings)
  // Tabs it could not reach get the script when they are next loaded.
  await injectIntoOpenTabs(settings).catch(() => {})
})

onSettingsChanged((settings, previous) => {
  if (settings.customSites.join() !== previous.customSites.join()) queueSiteSync(settings)
})

chrome.commands.onCommand.addListener((command: string, tab?: chrome.tabs.Tab) => sendCommandToTab(command, tab?.id))

// What arrives over the channel is unchecked, so every field is optional and unknown.
interface IncomingMessage {
  type?: unknown
  payload?: unknown
}

// The handler is picked by the message's runtime type, so the pairing of type and payload cannot be tracked here.
type UntypedMessageHandler = (payload: unknown, sender: chrome.runtime.MessageSender) => unknown

chrome.runtime.onMessage.addListener((message: IncomingMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse<unknown>) => void) => {
  const handleMessage = lookup(MESSAGE_HANDLERS, message?.type) as UntypedMessageHandler | undefined
  if (!handleMessage || !isAllowedSender(message.type, sender)) return false

  Promise.resolve()
    .then(() => handleMessage(message.payload, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof UserFacingError ? error.message : 'Something went wrong in the background service.',
      })
    })

  // Returning true keeps the message channel open until sendResponse runs asynchronously.
  return true
})
