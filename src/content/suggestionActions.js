import { MESSAGE_TYPES, sendMessage } from '../services/messaging.js'
import { getVisibleBox } from './fieldLocator.js'
import { readFieldText } from './fieldText.js'
import { isSameText, replaceFieldText } from './textReplacer.js'
import { CARD_ACTIONS } from './ui/suggestionCard.js'

// Carries out what the user chose on the card. Text only ever changes here, and only after an explicit click.
export const createSuggestionActions = ({ getSession, toast, onDismiss, onAnnounce }) => {
  let lastChange = null

  const showToast = ({ field, clippingAncestors }, message, onUndo) => {
    const { left, top, right, bottom } = field.getBoundingClientRect()
    toast.show(getVisibleBox(field, clippingAncestors) ?? { left, top, right, bottom }, message, onUndo)
    onAnnounce(onUndo ? `${message}. Press Control Z to undo.` : message)
  }

  const reportFailure = (session) => showToast(session, 'This text could not be changed')

  const undo = async () => {
    const session = getSession()
    const { field, kind, locator } = session
    const { offset, end, original, replacement } = lastChange
    lastChange = null
    toast.hide()

    // The browser or the editor may have changed spaces and invisible characters next to an emoji or mention.
    const isCurrent = isSameText(readFieldText(field, kind).slice(offset, end), replacement)
    const isRestored = isCurrent && (await replaceFieldText({ field, kind, caret: locator.getCaretOffset(), start: offset, end, replacement: original }))
    if (!isRestored && getSession() === session) reportFailure(session)
  }

  const accept = async ({ suggestion, replacement }) => {
    const session = getSession()
    const { field, kind, locator, state } = session
    const { offset, length, original } = suggestion

    // Sites can change a field without any event, so the text is compared again at the last moment.
    const text = readFieldText(field, kind)
    const isCurrent = text === state.text
    const isReplaced =
      isCurrent && (await replaceFieldText({ field, kind, caret: locator.getCaretOffset(), start: offset, end: offset + length, replacement }))
    if (getSession() !== session) return
    if (!isReplaced) return reportFailure(session)

    // The editor may have added characters of its own, so Undo takes back the span as it really ended up.
    const newText = readFieldText(field, kind)
    lastChange = { offset, end: offset + newText.length - (text.length - length), original, replacement, text: newText }
    showToast(session, 'Change made', undo)
  }

  const ignore = ({ suggestion }) => {
    onDismiss(suggestion)
    // The word is already gone from this field; only remembering it for other fields can fail here.
    sendMessage(MESSAGE_TYPES.ignoreWord, { word: suggestion.original }).catch(() => {})
  }

  const ACTION_HANDLERS = {
    [CARD_ACTIONS.accept]: accept,
    [CARD_ACTIONS.dismiss]: ({ suggestion }) => onDismiss(suggestion),
    [CARD_ACTIONS.ignore]: ignore,
  }

  return {
    handleAction: (action) => ACTION_HANDLERS[action.type](action),
    handleTextChanged: (text) => {
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
