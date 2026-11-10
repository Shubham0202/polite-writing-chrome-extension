/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { ENGINES, TONES, type Tone } from '../constants/corrections.ts'
import type { IdentifiedSuggestion } from '../engines/suggestion.ts'
import type { CardAnchor } from './ui/cardPosition.ts'
import type { InlineSession } from './inlineSuggestionManager.ts'
import type { CardActionRequest } from './suggestionActions.ts'
import type { CardSource } from './suggestionOpeners.ts'
import { findRewrite, getListItems, getSuggestionKey } from './suggestionState.ts'
import { CARD_ACTIONS, createSuggestionCard, type AiShortcutView, type CardAction, type ToggleSetting } from './ui/suggestionCard.ts'

const CARD_LAYOUTS = Object.freeze({
  single: 'single',
  list: 'list',
})

type CardLayout = (typeof CARD_LAYOUTS)[keyof typeof CARD_LAYOUTS]

// The list has no items of its own: it is re-read from the session's state each time.
interface OpenCard {
  layout: CardLayout
  source: CardSource
  items: IdentifiedSuggestion[]
  index: number
  choice: number
  tone: Tone | null | undefined
}

export interface SuggestionCardControllerOptions {
  parent: ParentNode
  host: Element
  getSession: () => InlineSession
  getAnchor: (suggestion: IdentifiedSuggestion) => CardAnchor
  getFieldAnchor: () => CardAnchor
  getAiShortcut: () => AiShortcutView
  getCloseOnAccept: () => ToggleSetting
  onChange: () => void
  onAction: (action: CardActionRequest) => Promise<void> | void
  onEscape: (id: string) => void
  onClose: () => void
}

export interface OpenSingleOptions {
  items: IdentifiedSuggestion[]
  index?: number
  source: CardSource
  moveFocus?: boolean
}

export interface OpenListOptions {
  source: CardSource
  moveFocus?: boolean
}

export interface SuggestionCardController {
  open: (options: OpenSingleOptions) => void
  openAll: (options: OpenListOptions) => void
  close: () => void
  refresh: () => void
  handleTextChanged: () => void
  getOpenSuggestion: () => IdentifiedSuggestion | null
  getOpenItemId: () => string | null
  getSource: () => CardSource | null
  isListOpen: () => boolean
  hasFocus: () => boolean
  focusPrimaryButton: () => void
}

// Decides what the one suggestion card shows: a single suggestion, with `items` to step through, or the list of all of
// them. Single items are a snapshot, so that card only stays open while the text is unchanged and their offsets remain
// valid. The list is re-read from the state each time, so it stays open while suggestions are accepted and dismissed.
export const createSuggestionCardController = ({ parent, host, getSession, getAnchor, getFieldAnchor, getAiShortcut, getCloseOnAccept, onChange, onAction, onEscape, onClose }: SuggestionCardControllerOptions): SuggestionCardController => {
  let open: OpenCard | null = null
  let listeners: AbortController | null = null
  let restoreSelection: (() => void) | null = null
  let renderedList: string | null = null

  const isList = (): boolean => open?.layout === CARD_LAYOUTS.list
  const getItem = () => open!.items[open!.index]
  const getToneAlternatives = () => getSession().state!.toneAlternatives

  // A sentence with no mistake in it is only a rewrite, so the card starts on the first tone that offers one.
  const getStartingTone = (item: IdentifiedSuggestion) =>
    item.engine === ENGINES.tone ? Object.values(TONES).find((tone) => findRewrite(getToneAlternatives(), item, tone)) : null

  const resolveSuggestion = (item: IdentifiedSuggestion, tone: Tone | null | undefined) => (tone && findRewrite(getToneAlternatives(), item, tone)) || item

  const getOpenSuggestion = () => (open && !isList() ? resolveSuggestion(getItem(), open!.tone) : null)

  const close = () => {
    if (!open) return
    const hadFocus = card.hasFocus()
    listeners!.abort()
    open = null
    renderedList = null
    card.hide()
    if (hadFocus) {
      getSession().field.focus()
      restoreSelection?.()
    }
    onClose()
    onChange()
  }

  const show = ({ moveFocus = false }: { moveFocus?: boolean } = {}) => {
    const suggestion = getOpenSuggestion()!
    card.render({
      suggestion,
      choice: open!.choice,
      position: open!.items.length > 1 ? `${open!.index + 1} of ${open!.items.length}` : null,
      canAdvance: open!.items.length > 1,
      activeTone: open!.tone,
      tones: Object.values(TONES).filter((tone) => findRewrite(getToneAlternatives(), getItem(), tone)),
    })
    onChange()
    if (moveFocus) card.focusPrimaryButton()
  }

  // The list also carries the AI rewrite: its switch, and the loader, notice or error of the current request. It can
  // be open for that request alone, before any check result exists.
  const showList = () => {
    const { state, aiStatus } = getSession()
    const suggestions = state ? getListItems(state).map((item) => resolveSuggestion(item, getStartingTone(item))) : []
    if (!suggestions.length && !aiStatus) return close()

    const ai = { ...getAiShortcut(), status: aiStatus }
    const closeOnAccept = getCloseOnAccept()
    // This runs on every scroll frame, so the list is only rebuilt when what it shows has changed.
    const listKey = [
      String(ai.isEnabled),
      String(closeOnAccept.isEnabled),
      ai.status?.kind,
      ai.status?.message,
      ...suggestions.map((suggestion) => `${suggestion.offset}:${getSuggestionKey(suggestion)}`),
    ].join('\n\n')
    if (listKey !== renderedList) {
      renderedList = listKey
      card.renderList(suggestions, ai, closeOnAccept)
    }
    card.moveTo(getFieldAnchor())
  }

  // The single card closes after any action. The list closes after Accept on the AI's rewrite, which is what the user
  // asked for, or after any Accept while "Close after Accept" is on; otherwise it stays open for the rest.
  const closesAfter = (type: CardAction, suggestion: IdentifiedSuggestion) =>
    !isList() || (type === CARD_ACTIONS.accept && (suggestion.engine === ENGINES.rewrite || getCloseOnAccept().isEnabled))

  const handleAction = (type: CardAction, suggestion: IdentifiedSuggestion = getOpenSuggestion()!) => {
    const replacement = suggestion.replacements[open!.choice ?? 0] ?? suggestion.replacements[0]
    if (closesAfter(type, suggestion)) {
      close()
      onAction({ type, suggestion, replacement })
      return
    }
    // The list stays open. Accepting gives the field focus for the edit; once that is over, a keyboard user who was
    // in the list is taken to the Accept of the suggestion now in that place, so Enter keeps working down the list.
    const hadFocus = card.hasFocus()
    const itemIndex = card.getFocusedItemIndex()
    Promise.resolve(onAction({ type, suggestion, replacement })).then(() => {
      if (!hadFocus || !isList()) return
      if (!card.hasFocus()) restoreSelection = getSession().locator!.captureSelection()
      card.focusItem(itemIndex)
    })
  }

  const handleChoose = (choice: number) => {
    open!.choice = choice
    show()
  }

  const handleNext = () => {
    open!.index = (open!.index + 1) % open!.items.length
    open!.choice = 0
    open!.tone = getStartingTone(getItem())
    show()
  }

  const handleTone = (tone: Tone) => {
    const isRewriteOnly = getItem().engine === ENGINES.tone
    open!.tone = open!.tone === tone && !isRewriteOnly ? null : tone
    open!.choice = 0
    show()
  }

  const card = createSuggestionCard(parent, { onAction: handleAction, onChoose: handleChoose, onNext: handleNext, onTone: handleTone })

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    if (!isList()) onEscape(getItem().id)
    close()
  }

  const handleMouseDown = (event: MouseEvent) => {
    if (event.target !== host) close()
  }

  const listen = () => {
    if (open) return
    listeners = new AbortController()
    const options = { capture: true, signal: listeners.signal }
    document.addEventListener('keydown', handleKeyDown, options)
    document.addEventListener('mousedown', handleMouseDown, options)
  }

  return {
    open: ({ items, index = 0, source, moveFocus = false }: OpenSingleOptions) => {
      listen()
      open = { layout: CARD_LAYOUTS.single, items, index, source, choice: 0, tone: getStartingTone(items[index]) ?? null }
      if (moveFocus) restoreSelection = getSession().locator!.captureSelection()
      show({ moveFocus })
    },
    openAll: ({ source, moveFocus = false }: OpenListOptions) => {
      listen()
      open = { layout: CARD_LAYOUTS.list, source } as OpenCard
      renderedList = null
      if (moveFocus) restoreSelection = getSession().locator!.captureSelection()
      showList()
      if (moveFocus && open) card.focusPrimaryButton()
    },
    close,
    // Runs on every layout pass: the single card follows its word, the list follows the field and what is left to review.
    refresh: () => {
      if (!open) return
      if (isList()) showList()
      else card.moveTo(getAnchor(getOpenSuggestion()!))
    },
    // The single card's snapshot no longer matches the text; the list is re-read from the state instead.
    handleTextChanged: () => {
      if (open && !isList()) close()
    },
    getOpenSuggestion,
    getOpenItemId: () => (open && !isList() ? getItem().id : null),
    getSource: () => open?.source ?? null,
    isListOpen: isList,
    hasFocus: card.hasFocus,
    focusPrimaryButton: card.focusPrimaryButton,
  }
}
