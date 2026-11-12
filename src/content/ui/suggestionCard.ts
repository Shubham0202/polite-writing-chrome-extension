/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { REWRITE_STYLE_LABEL, REWRITE_STYLES, type RewriteStyle } from '../../constants/ai.ts'
import { CATEGORY_LABEL, ENGINES, TONE_LABEL, TONES, type Tone } from '../../constants/corrections.ts'
import { formatSnippet, type IdentifiedSuggestion } from '../../engines/suggestion.ts'
import { getNavigationTarget } from './cardNavigation.ts'
import { computeCardPosition, type CardAnchor } from './cardPosition.ts'
import { createElement } from './dom.ts'

export const CARD_ACTIONS = Object.freeze({
  accept: 'accept',
  dismiss: 'dismiss',
  ignore: 'ignore',
})

export type CardAction = (typeof CARD_ACTIONS)[keyof typeof CARD_ACTIONS]

// What a card says about the AI rewrite: that it is running, what came of it, why it failed, or that it needs a key.
export const AI_STATUS_KINDS = Object.freeze({
  pending: 'pending',
  answer: 'answer',
  error: 'error',
  setup: 'setup',
})

export type AiStatusKind = (typeof AI_STATUS_KINDS)[keyof typeof AI_STATUS_KINDS]

export type AiStatus =
  | { kind: typeof AI_STATUS_KINDS.pending | typeof AI_STATUS_KINDS.error | typeof AI_STATUS_KINDS.setup; message: string }
  | { kind: typeof AI_STATUS_KINDS.answer; message: string; isEarlier: boolean; answerMessage: string | null }

export interface ToggleSetting {
  isEnabled: boolean
  onToggle: () => void
}

export interface AiShortcutView extends ToggleSetting {
  style: RewriteStyle | null
  onStyleChange: (style: RewriteStyle) => void
  onOpenSettings: () => void
  onRegenerate: () => void
}

export interface AiCardView extends AiShortcutView {
  status: AiStatus | null
}

// What the single card shows.
export interface SuggestionCardView {
  suggestion: IdentifiedSuggestion
  choice: number
  position: string | null
  canAdvance: boolean
  activeTone: Tone | null | undefined
  tones: Tone[]
  ai: AiCardView
}

export interface SuggestionCardHandlers {
  onAction: (type: CardAction, suggestion?: IdentifiedSuggestion) => void
  onChoose: (choice: number) => void
  onNext: () => void
  onTone: (tone: Tone) => void
}

export interface SuggestionCard {
  render: (view: SuggestionCardView) => void
  renderList: (suggestions: IdentifiedSuggestion[], ai: AiCardView, closeOnAccept: ToggleSetting) => void
  moveTo: (anchor: CardAnchor) => void
  hide: () => void
  focusPrimaryButton: () => void
  focusItem: (index: number) => void
  getFocusedItemIndex: () => number
  hasFocus: () => boolean
}

const AI_ITEM_LABEL = 'AI rewrite'
const AI_TOGGLE_LABEL = 'Rewrite with AI'
const CLOSE_ON_ACCEPT_LABEL = 'Close after Accept'

const createButton = (label: string, onClick: (event: MouseEvent) => void, { isPrimary = false, isPressed }: { isPrimary?: boolean; isPressed?: boolean } = {}) =>
  createElement('button', {
    className: isPrimary ? 'wb-button wb-button--primary' : 'wb-button',
    text: label,
    attributes: { type: 'button', ...(isPressed === undefined ? {} : { 'aria-pressed': String(isPressed) }) },
    onClick,
  })

const createChange = ({ original }: Pick<IdentifiedSuggestion, 'original'>, replacement: string) =>
  createElement('p', { className: 'wb-card__change' }, [
    original ? createElement('del', { text: formatSnippet(original) }) : createElement('span', { className: 'wb-card__placeholder', text: 'Add' }),
    createElement('span', { className: 'wb-card__arrow', text: '→', attributes: { 'aria-hidden': 'true' } }),
    replacement ? createElement('ins', { text: formatSnippet(replacement) }) : createElement('span', { className: 'wb-card__placeholder', text: 'remove' }),
  ])

const getItemLabel = (suggestion: IdentifiedSuggestion) => (suggestion.engine === ENGINES.rewrite ? AI_ITEM_LABEL : CATEGORY_LABEL[suggestion.category])

const describeCount = (count: number) => (count ? `${count} ${count === 1 ? 'suggestion' : 'suggestions'}` : 'No suggestions')

interface AiStatusDecoration {
  before: HTMLElement[]
  after: HTMLElement[]
  isWarning?: boolean
}

// A running rewrite shows a loader. An answer, new or from earlier, can be regenerated, and a failed request retried.
// Without a key, the card warns and offers the way to the key field in Settings.
const AI_STATUS_DECORATIONS: Record<AiStatusKind, (ai: AiCardView) => AiStatusDecoration> = {
  [AI_STATUS_KINDS.pending]: () => ({ before: [createElement('span', { className: 'wb-spinner', attributes: { 'aria-hidden': 'true' } })], after: [] }),
  [AI_STATUS_KINDS.answer]: ({ onRegenerate }) => ({ before: [], after: [createButton('Regenerate', onRegenerate)] }),
  [AI_STATUS_KINDS.error]: ({ onRegenerate }) => ({ before: [], after: [createButton('Try again', onRegenerate)] }),
  [AI_STATUS_KINDS.setup]: ({ onOpenSettings }) => ({ before: [], after: [createButton('Open Settings', onOpenSettings)], isWarning: true }),
}

const createAiStatus = (ai: AiCardView) => {
  const { before, after, isWarning } = AI_STATUS_DECORATIONS[ai.status!.kind](ai)
  return createElement('div', { className: isWarning ? 'wb-card__status wb-card__status--warning' : 'wb-card__status' }, [
    ...before,
    createElement('span', { text: ai.status!.message }),
    ...after,
  ])
}

const createStylePicker = ({ style, onStyleChange }: Pick<AiCardView, 'style' | 'onStyleChange'>) => {
  const select = createElement(
    'select',
    { className: 'wb-select', attributes: { 'aria-label': 'AI rewrite style' } },
    Object.values(REWRITE_STYLES).map((value) => createElement('option', { text: REWRITE_STYLE_LABEL[value], attributes: { value } })),
  ) as HTMLSelectElement
  select.value = style ?? REWRITE_STYLES.improveWording
  select.addEventListener('change', () => onStyleChange(select.value as RewriteStyle))
  return select
}

// The same switch and style as in Settings, on both cards, so the AI can be found without knowing the shortcut. The
// label and its dropdown wrap to the next line together on the narrow single card.
const createAiRow = (ai: AiCardView) =>
  createElement('div', { className: 'wb-card__row wb-card__ai' }, [
    createButton(AI_TOGGLE_LABEL, ai.onToggle, { isPressed: ai.isEnabled }),
    createElement('span', { className: 'wb-card__style' }, [createElement('span', { text: 'Style', attributes: { 'aria-hidden': 'true' } }), createStylePicker(ai)]),
  ])

const createAiSection = (ai: AiCardView) => [createAiRow(ai), ...(ai.status ? [createAiStatus(ai)] : [])]

// Pressing the mouse on the card leaves focus and the caret in the user's field; only a dropdown needs the press to open.
const keepFieldFocusOnMouseDown = (event: MouseEvent) => {
  if ((event.target as Element).localName !== 'select') event.preventDefault()
}

export const createSuggestionCard = (parent: ParentNode, { onAction, onChoose, onNext, onTone }: SuggestionCardHandlers): SuggestionCard => {
  const card = createElement('div', { className: 'wb-card', attributes: { role: 'dialog', 'aria-label': 'Writing suggestion', hidden: '' } })
  card.addEventListener('mousedown', keepFieldFocusOnMouseDown)
  parent.append(card)

  // The style dropdown is a control like the buttons: Tab and the arrow keys move to and from it, so arrows on it never
  // change the style (each change asks the AI); Space or Alt+Down opens it.
  const getButtons = (): HTMLElement[] => [...card.querySelectorAll<HTMLElement>('button, select')]
  const getFocusedElement = () => (card.getRootNode() as ShadowRoot).activeElement as HTMLElement

  const trapTab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const buttons = getButtons()
    const edge = event.shiftKey ? buttons[0] : buttons.at(-1)
    if (getFocusedElement() !== edge) return
    event.preventDefault()
    ;(event.shiftKey ? buttons.at(-1) : buttons[0])!.focus()
  }
  card.addEventListener('keydown', trapTab)

  // Each element holding buttons is one row: the header, the AI row, the AI status, and each suggestion's actions. The
  // style dropdown sits in a wrapper of its own but belongs to the AI row.
  const getButtonRows = () => {
    const rows = new Map<Element | null, HTMLElement[]>()
    getButtons().forEach((button) => {
      const row = button.closest('.wb-card__row') ?? button.parentElement
      rows.set(row, [...(rows.get(row) ?? []), button])
    })
    return [...rows.values()]
  }

  // Modified arrows are left to the browser and to screen readers.
  const navigate = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const rows = getButtonRows()
    const row = rows.findIndex((buttons) => buttons.includes(getFocusedElement()))
    if (row === -1) return
    const column = rows[row].indexOf(getFocusedElement())
    const target = getNavigationTarget({ rowSizes: rows.map((buttons) => buttons.length), row, column, key: event.key })
    if (!target) return
    // Arrows would otherwise scroll the list or the page behind it.
    event.preventDefault()
    event.stopPropagation()
    rows[target.row][target.column].focus()
  }
  card.addEventListener('keydown', navigate)

  const createHeader = ({ suggestion, position }: { suggestion: IdentifiedSuggestion; position?: string | null }) =>
    createElement('div', { className: 'wb-card__header' }, [
      createElement('span', { className: 'wb-card__label', text: getItemLabel(suggestion) }),
      ...(position ? [createElement('span', { text: position })] : []),
    ])

  const createChoices = ({ suggestion, choice }: SuggestionCardView) =>
    suggestion.replacements.length > 1
      ? [
          createElement(
            'div',
            { className: 'wb-card__row', attributes: { role: 'group', 'aria-label': 'Replacements' } },
            suggestion.replacements.map((replacement, index) => createButton(formatSnippet(replacement), () => onChoose(index), { isPressed: index === choice })),
          ),
        ]
      : []

  // In the list every item has its own `act`, so the right suggestion is acted on.
  const createActions = ({ suggestion, canAdvance = false }: { suggestion: IdentifiedSuggestion; canAdvance?: boolean }, act: (type: CardAction) => void) =>
    createElement('div', { className: 'wb-card__row' }, [
      createButton('Accept', () => act(CARD_ACTIONS.accept), { isPrimary: true }),
      createButton('Dismiss', () => act(CARD_ACTIONS.dismiss)),
      ...(suggestion.engine === ENGINES.spelling ? [createButton('Ignore', () => act(CARD_ACTIONS.ignore))] : []),
      ...(canAdvance ? [createButton('Next', onNext)] : []),
    ])

  const createTones = ({ tones, activeTone }: SuggestionCardView) =>
    tones.length
      ? [
          createElement(
            'div',
            { className: 'wb-card__row', attributes: { role: 'group', 'aria-label': 'Rewrite this sentence' } },
            tones.map((tone) => createButton(tone === TONES.polite ? 'Make Polite' : TONE_LABEL[tone], () => onTone(tone), { isPressed: tone === activeTone })),
          ),
        ]
      : []

  // With no suggestion to accept, the AI row's button is the one thing to act on.
  const focusPrimaryButton = () => (card.querySelector<HTMLElement>('.wb-button--primary') ?? card.querySelector<HTMLElement>('.wb-card__status .wb-button'))?.focus()

  const getItems = () => [...card.querySelectorAll('.wb-card__item')]
  const getFocusedItemIndex = () => getItems().findIndex((item) => item.contains(getFocusedElement()))

  // After Accept or Dismiss, the suggestion that took the handled one's place gets the focus, on its Accept.
  const focusItem = (index: number) => {
    const items = getItems()
    const item = items[Math.min(index, items.length - 1)]
    const accept = item?.querySelector<HTMLElement>('.wb-button--primary')
    if (accept) accept.focus()
    else focusPrimaryButton()
  }

  // Rebuilding the buttons would drop keyboard focus, so it returns to the same place.
  const replaceContents = (isList: boolean, children: Node[]) => {
    const focusedIndex = getButtons().indexOf(getFocusedElement())
    card.hidden = false
    card.classList.toggle('wb-card--list', isList)
    card.replaceChildren(...children)
    if (focusedIndex !== -1) (getButtons()[focusedIndex] ?? card.querySelector<HTMLElement>('.wb-button--primary'))?.focus()
  }

  const render = (view: SuggestionCardView) =>
    replaceContents(false, [
      createHeader(view),
      createChange(view.suggestion, view.suggestion.replacements[view.choice] ?? view.suggestion.replacements[0]),
      ...createChoices(view),
      createElement('p', { className: 'wb-card__explanation', text: view.suggestion.explanation }),
      createActions(view, onAction),
      ...createTones(view),
      ...createAiSection(view.ai),
    ])

  // Every suggestion at once, each with its own buttons. Under the header come the AI switch and style, and the state
  // of the current AI request, if there is one.
  const renderList = (suggestions: IdentifiedSuggestion[], ai: AiCardView, closeOnAccept: ToggleSetting) =>
    replaceContents(true, [
      createElement('div', { className: 'wb-card__header' }, [
        createElement('span', { className: 'wb-card__label', text: describeCount(suggestions.length) }),
        createButton(CLOSE_ON_ACCEPT_LABEL, closeOnAccept.onToggle, { isPressed: closeOnAccept.isEnabled }),
      ]),
      ...createAiSection(ai),
      ...suggestions.map((suggestion) =>
        createElement('div', { className: 'wb-card__item' }, [
          createHeader({ suggestion }),
          createChange(suggestion, suggestion.replacements[0]),
          createElement('p', { className: 'wb-card__explanation', text: suggestion.explanation }),
          createActions({ suggestion }, (type) => onAction(type, suggestion)),
        ]),
      ),
    ])

  const moveTo = (anchor: CardAnchor) => {
    const { left, top } = computeCardPosition(anchor, card.getBoundingClientRect(), { width: innerWidth, height: innerHeight })
    card.style.transform = `translate(${left}px, ${top}px)`
  }

  const hide = () => {
    card.hidden = true
  }

  return {
    render,
    renderList,
    moveTo,
    hide,
    focusPrimaryButton,
    focusItem,
    getFocusedItemIndex,
    hasFocus: () => !card.hidden && card.contains(getFocusedElement()),
  }
}
