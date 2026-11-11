import type { IdentifiedSuggestion } from '../engines/suggestion.ts'
import { MESSAGE_TYPES, sendMessage } from '../services/messaging.ts'
import { devLog } from '../utils/devLog.ts'
import { getVisibleBox } from './fieldLocator.ts'
import { readFieldText } from './fieldText.ts'
import { isSameText, replaceFieldText } from './textReplacer.ts'
import type { InlineSession } from './inlineSuggestionManager.ts'
import type { ChangeToast } from './ui/changeToast.ts'
import { CARD_ACTIONS, type CardAction } from './ui/suggestionCard.ts'

export interface CardActionRequest {
  type: CardAction
  suggestion: IdentifiedSuggestion
  replacement: string
}

export interface SuggestionActionsOptions {
  getSession: () => InlineSession
  toast: ChangeToast
  onDismiss: (suggestion: IdentifiedSuggestion) => void
  onAnnounce: (message: string) => void
}

export interface SuggestionActions {
  handleAction: (action: CardActionRequest) => Promise<void> | void
  handleTextChanged: (text: string) => void
  reset: () => void
}

// What the last accepted change put in the field, so Undo can take exactly that back.
interface LastChange {
  offset: number
  end: number
  original: string
  replacement: string
  text: string
}

// Carries out what the user chose on the card. Text only ever changes here, and only after an explicit click.
export const createSuggestionActions = ({ getSession, toast, onDismiss, onAnnounce }: SuggestionActionsOptions): SuggestionActions => {
  let lastChange: LastChange | null = null

  const showToast = ({ field, clippingAncestors }: InlineSession, message: string, onUndo?: () => void) => {
    const { left, top, right, bottom } = field.getBoundingClientRect()
    toast.show(getVisibleBox(field, clippingAncestors!) ?? { left, top, right, bottom }, message, onUndo)
    onAnnounce(onUndo ? `${message}. Press Control Z to undo.` : message)
  }

  const reportFailure = (session: InlineSession) => showToast(session, 'This text could not be changed')

  const undo = async () => {
    const session = getSession()
    const { field, kind, locator } = session
    const { offset, end, original, replacement } = lastChange!
    lastChange = null
    toast.hide()

    // The browser or the editor may have changed spaces and invisible characters next to an emoji or mention.
    const isCurrent = isSameText(readFieldText(field, kind).slice(offset, end), replacement)
    const isRestored = isCurrent && (await replaceFieldText({ field, kind, caret: locator!.getCaretOffset(), start: offset, end, replacement: original }))
    if (!isRestored && getSession() === session) reportFailure(session)
  }

  const accept = async ({ suggestion, replacement }: CardActionRequest) => {
    const session = getSession()
    const { field, kind, locator, state } = session
    const { offset, length, original } = suggestion

    // Sites can change a field without any event, so the text is compared again at the last moment.
    const text = readFieldText(field, kind)
    const isCurrent = text === state!.text
    if (!isCurrent) devLog('Accept failed: the text changed since it was checked', () => ({ length: text.length, checkedLength: state!.text.length }))
    const isReplaced =
      isCurrent && (await replaceFieldText({ field, kind, caret: locator!.getCaretOffset(), start: offset, end: offset + length, replacement }))
    if (getSession() !== session) return
    if (!isReplaced) return reportFailure(session)

    // The editor may have added characters of its own, so Undo takes back the span as it really ended up.
    const newText = readFieldText(field, kind)
    lastChange = { offset, end: offset + newText.length - (text.length - length), original, replacement, text: newText }
    showToast(session, 'Change made', undo)
  }

  const ignore = ({ suggestion }: CardActionRequest) => {
    onDismiss(suggestion)
    // The word is already gone from this field; only remembering it for other fields can fail here.
    sendMessage(MESSAGE_TYPES.ignoreWord, { word: suggestion.original }).catch(() => {})
  }

  const ACTION_HANDLERS: Record<CardAction, (action: CardActionRequest) => Promise<void> | void> = {
    [CARD_ACTIONS.accept]: accept,
    [CARD_ACTIONS.dismiss]: ({ suggestion }) => onDismiss(suggestion),
    [CARD_ACTIONS.ignore]: ignore,
  }

  return {
    handleAction: (action: CardActionRequest) => ACTION_HANDLERS[action.type](action),
    handleTextChanged: (text: string) => {
      if (!lastChange || text === lastChange.text) return
      lastChange = null
      toast.hide()
    },
    reset: () => {
      lastChange = null
      toast.hide()
    },
  }
}
