import type { RewriteStyle } from '../constants/ai.ts'
import type { CardSettingChange, Settings } from '../constants/settings.ts'
import type { CorrectionRequest, CorrectionResult, InlineCheckResult } from './correctionPipeline.ts'
import type { RewriteResult } from './writingEnhancer.ts'

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
  runShortcutFallback: 'RUN_SHORTCUT_FALLBACK',
  getSettings: 'GET_SETTINGS',
  updateCardSetting: 'UPDATE_CARD_SETTING',
  openAiSettings: 'OPEN_AI_SETTINGS',
  settingsChanged: 'SETTINGS_CHANGED',
})

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES]

// The keyboard shortcuts in manifest.json "commands", and what each one asks the page to do.
export const COMMAND_MESSAGES = Object.freeze({
  'open-suggestion': MESSAGE_TYPES.openSuggestion,
  'open-all-suggestions': MESSAGE_TYPES.openAllSuggestions,
})

export type CommandMessageType = (typeof COMMAND_MESSAGES)[keyof typeof COMMAND_MESSAGES]

// What the service worker sends to the content scripts of a tab: a relayed shortcut, or the settings after a change,
// since content scripts cannot read storage. None of them has an answer.
export type PageMessageType = CommandMessageType | typeof MESSAGE_TYPES.settingsChanged

// What content scripts are told: the settings, and only whether an AI key is saved, never the key itself.
export interface PageSettings {
  settings: Settings
  isAiConfigured: boolean
}

export interface PageMessage {
  type: PageMessageType
  payload?: PageSettings
}

export interface PingResult {
  version: string
  // Null when the AI settings could not be read; the popup then just leaves its setup hint out.
  isAiConfigured: boolean | null
}

// What each request to the service worker carries and what it answers with. The shortcut messages go the other way,
// from the service worker to a page, and have no answer.
export interface MessageContract {
  [MESSAGE_TYPES.ping]: { payload: undefined; result: PingResult }
  [MESSAGE_TYPES.runCorrection]: { payload: Omit<CorrectionRequest, 'signal'>; result: CorrectionResult }
  [MESSAGE_TYPES.runInlineCheck]: { payload: { text: string }; result: InlineCheckResult }
  [MESSAGE_TYPES.cancelInlineCheck]: { payload: undefined; result: void }
  [MESSAGE_TYPES.ignoreWord]: { payload: { word: string }; result: void }
  [MESSAGE_TYPES.loadInlineUi]: { payload: undefined; result: void }
  [MESSAGE_TYPES.runRewrite]: { payload: { text: string; style: RewriteStyle; clientId?: string }; result: RewriteResult }
  // A popup names its own request; the page has only one, so it sends no payload.
  [MESSAGE_TYPES.cancelRewrite]: { payload: { clientId?: string } | undefined; result: void }
  // A page saw the default key of a shortcut that Chrome may have left unset.
  [MESSAGE_TYPES.runShortcutFallback]: { payload: { command: string }; result: void }
  // Storage holds the AI keys and is closed to content scripts, so they ask for the settings here instead.
  [MESSAGE_TYPES.getSettings]: { payload: undefined; result: PageSettings }
  [MESSAGE_TYPES.updateCardSetting]: { payload: CardSettingChange; result: void }
  // Content scripts cannot open extension pages, so the card asks for Settings, at the API key field, here.
  [MESSAGE_TYPES.openAiSettings]: { payload: undefined; result: void }
}

export type RequestMessageType = keyof MessageContract
export type MessagePayload<Type extends RequestMessageType> = MessageContract[Type]['payload']
export type MessageResult<Type extends RequestMessageType> = MessageContract[Type]['result']

export interface RequestMessage<Type extends RequestMessageType = RequestMessageType> {
  type: Type
  payload?: MessagePayload<Type>
}

export type MessageResponse<Data> = { ok: true; data: Data } | { ok: false; error: string }

// The parts of a sender these helpers read; chrome.runtime.MessageSender has them all.
export interface MessageSenderInfo {
  id?: string
  url?: string
  frameId?: number
  tab?: { id?: number }
}

// Payloads come from another part of the extension, which a page may have taken over, so handlers read them
// defensively: any field may be missing.
export type MessageHandlers = {
  [Type in RequestMessageType]: (
    payload: Partial<MessagePayload<Type>> | undefined,
    sender: chrome.runtime.MessageSender,
  ) => MessageResult<Type> | Promise<MessageResult<Type>>
}

const EXTENSION_PAGE_KEY = 'extension-page'

const getExtensionPagePath = (sender: MessageSenderInfo | undefined) => {
  try {
    // A sender without a URL makes URL throw, which leads to the shared key below.
    return new URL(sender?.url as string).pathname
  } catch {
    return EXTENSION_PAGE_KEY
  }
}

// Names who sent a message, so that a newer request replaces only that sender's older one. Each frame of a tab has
// its own key, so typing in one tab never cancels a check in another. The popup and the settings page have no tab;
// their page path tells them apart, and a reopened popup takes over from the one that was closed.
export const getSenderKey = (sender: MessageSenderInfo | undefined): string =>
  sender?.tab ? `${sender.tab.id}:${sender.frameId}` : getExtensionPagePath(sender)

export const SENDER_ROLES = Object.freeze({
  extensionPage: 'extension-page',
  contentScript: 'content-script',
})

export type SenderRole = (typeof SENDER_ROLES)[keyof typeof SENDER_ROLES]

// Settings opens in a tab, so a tab alone does not mean a content script: extension pages load from the extension's
// own address, while a content script reports the web page it runs in.
export const getSenderRole = (sender: MessageSenderInfo | undefined, extensionUrl: string): SenderRole | null => {
  if (sender?.url?.startsWith(extensionUrl)) return SENDER_ROLES.extensionPage
  return sender?.tab ? SENDER_ROLES.contentScript : null
}

// The answer crosses from the service worker, so its type is what the contract promises, not something checked here.
const sendRuntimeMessage = async <Type extends RequestMessageType>(message: RequestMessage<Type>) => {
  try {
    return await chrome.runtime.sendMessage<RequestMessage<Type>, MessageResponse<MessageResult<Type>> | undefined>(message)
  } catch {
    throw new Error('The background service is not available. Close and reopen the popup to try again.')
  }
}

// Requests without a payload are sent with the type alone, and an optional payload may be left out.
type PayloadArguments<Type extends RequestMessageType> = MessagePayload<Type> extends undefined
  ? []
  : undefined extends MessagePayload<Type>
    ? [payload?: MessagePayload<Type>]
    : [payload: MessagePayload<Type>]

export const sendMessage: <Type extends RequestMessageType>(type: Type, ...payload: PayloadArguments<Type>) => Promise<MessageResult<Type>> =
  async <Type extends RequestMessageType>(type: Type, payload?: MessagePayload<Type>): Promise<MessageResult<Type>> => {
    const response = await sendRuntimeMessage<Type>({ type, payload })

    if (!response?.ok) {
      throw new Error(response?.error ?? 'The background service did not respond.')
    }

    return response.data
  }
