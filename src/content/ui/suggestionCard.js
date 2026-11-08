import { CATEGORY_LABEL, ENGINES, TONE_LABEL, TONES } from '../../constants/corrections.js'
import { formatSnippet } from '../../engines/suggestion.js'
import { getNavigationTarget } from './cardNavigation.js'
import { computeCardPosition } from './cardPosition.js'
import { createElement, keepFocusOnMouseDown } from './dom.js'

export const CARD_ACTIONS = Object.freeze({
  accept: 'accept',
  dismiss: 'dismiss',
  ignore: 'ignore',
})

// What the list says about the AI rewrite: that it is running, what came of it, or why it failed.
export const AI_STATUS_KINDS = Object.freeze({
  pending: 'pending',
  answer: 'answer',
  error: 'error',
})

const AI_ITEM_LABEL = 'AI rewrite'
const AI_TOGGLE_LABEL = 'Rewrite with AI'
const CLOSE_ON_ACCEPT_LABEL = 'Close after Accept'

const createButton = (label, onClick, { isPrimary = false, isPressed } = {}) =>
  createElement('button', {
    className: isPrimary ? 'wb-button wb-button--primary' : 'wb-button',
    text: label,
    attributes: { type: 'button', ...(isPressed === undefined ? {} : { 'aria-pressed': String(isPressed) }) },
    onClick,
  })

const createChange = ({ original }, replacement) =>
  createElement('p', { className: 'wb-card__change' }, [
    original ? createElement('del', { text: formatSnippet(original) }) : createElement('span', { className: 'wb-card__placeholder', text: 'Add' }),
    createElement('span', { className: 'wb-card__arrow', text: '→', attributes: { 'aria-hidden': 'true' } }),
    replacement ? createElement('ins', { text: formatSnippet(replacement) }) : createElement('span', { className: 'wb-card__placeholder', text: 'remove' }),
  ])

const getItemLabel = (suggestion) => (suggestion.engine === ENGINES.rewrite ? AI_ITEM_LABEL : CATEGORY_LABEL[suggestion.category])

const describeCount = (count) => (count ? `${count} ${count === 1 ? 'suggestion' : 'suggestions'}` : 'No suggestions')

// A running rewrite shows a loader. An answer, new or from earlier, can be regenerated, and a failed request retried.
const AI_STATUS_DECORATIONS = {
  [AI_STATUS_KINDS.pending]: () => ({ before: [createElement('span', { className: 'wb-spinner', attributes: { 'aria-hidden': 'true' } })], after: [] }),
  [AI_STATUS_KINDS.answer]: ({ onRegenerate }) => ({ before: [], after: [createButton('Regenerate', onRegenerate)] }),
  [AI_STATUS_KINDS.error]: ({ onRegenerate }) => ({ before: [], after: [createButton('Try again', onRegenerate)] }),
}

const createAiStatus = (ai) => {
  const { before, after } = AI_STATUS_DECORATIONS[ai.status.kind](ai)
  return createElement('div', { className: 'wb-card__status' }, [...before, createElement('span', { text: ai.status.message }), ...after])
}

export const createSuggestionCard = (parent, { onAction, onChoose, onNext, onTone }) => {
  const card = createElement('div', { className: 'wb-card', attributes: { role: 'dialog', 'aria-label': 'Writing suggestion', hidden: '' } })
  keepFocusOnMouseDown(card)
  parent.append(card)

  const getButtons = () => [...card.querySelectorAll('button')]
  const getFocusedElement = () => card.getRootNode().activeElement

  const trapTab = (event) => {
    if (event.key !== 'Tab') return
    const buttons = getButtons()
    const edge = event.shiftKey ? buttons[0] : buttons.at(-1)
    if (getFocusedElement() !== edge) return
    event.preventDefault()
    ;(event.shiftKey ? buttons.at(-1) : buttons[0]).focus()
  }
  card.addEventListener('keydown', trapTab)

  // Each element holding buttons is one row: the AI switch, the AI row, and each suggestion's actions.
  const getButtonRows = () => {
    const rows = new Map()
    getButtons().forEach((button) => rows.set(button.parentElement, [...(rows.get(button.parentElement) ?? []), button]))
    return [...rows.values()]
  }

  // Modified arrows are left to the browser and to screen readers.
  const navigate = (event) => {
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

  const createHeader = ({ suggestion, position }) =>
    createElement('div', { className: 'wb-card__header' }, [
      createElement('span', { className: 'wb-card__label', text: getItemLabel(suggestion) }),
      ...(position ? [createElement('span', { text: position })] : []),
    ])

  const createChoices = ({ suggestion, choice }) =>
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
  const createActions = ({ suggestion, canAdvance = false }, act) =>
    createElement('div', { className: 'wb-card__row' }, [
      createButton('Accept', () => act(CARD_ACTIONS.accept), { isPrimary: true }),
      createButton('Dismiss', () => act(CARD_ACTIONS.dismiss)),
      ...(suggestion.engine === ENGINES.spelling ? [createButton('Ignore', () => act(CARD_ACTIONS.ignore))] : []),
      ...(canAdvance ? [createButton('Next', onNext)] : []),
    ])

  const createTones = ({ tones, activeTone }) =>
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
  const focusPrimaryButton = () => (card.querySelector('.wb-button--primary') ?? card.querySelector('.wb-card__status .wb-button'))?.focus()

  const getItems = () => [...card.querySelectorAll('.wb-card__item')]
  const getFocusedItemIndex = () => getItems().findIndex((item) => item.contains(getFocusedElement()))

  // After Accept or Dismiss, the suggestion that took the handled one's place gets the focus, on its Accept.
  const focusItem = (index) => {
    const items = getItems()
    const item = items[Math.min(index, items.length - 1)]
    const accept = item?.querySelector('.wb-button--primary')
    if (accept) accept.focus()
    else focusPrimaryButton()
  }

  // Rebuilding the buttons would drop keyboard focus, so it returns to the same place.
  const replaceContents = (isList, children) => {
    const focusedIndex = getButtons().indexOf(getFocusedElement())
    card.hidden = false
    card.classList.toggle('wb-card--list', isList)
    card.replaceChildren(...children)
    if (focusedIndex !== -1) (getButtons()[focusedIndex] ?? card.querySelector('.wb-button--primary'))?.focus()
  }

  const render = (view) =>
    replaceContents(false, [
      createHeader(view),
      createChange(view.suggestion, view.suggestion.replacements[view.choice] ?? view.suggestion.replacements[0]),
      ...createChoices(view),
      createElement('p', { className: 'wb-card__explanation', text: view.suggestion.explanation }),
      createActions(view, onAction),
      ...createTones(view),
    ])

  // Every suggestion at once, each with its own buttons. The header carries the AI rewrite switch, and the row under
  // it the state of the current AI request, if there is one.
  const renderList = (suggestions, ai, closeOnAccept) =>
    replaceContents(true, [
      createElement('div', { className: 'wb-card__header' }, [
        createElement('span', { className: 'wb-card__label', text: describeCount(suggestions.length) }),
        createElement('div', { className: 'wb-card__row' }, [
          createButton(AI_TOGGLE_LABEL, ai.onToggle, { isPressed: ai.isEnabled }),
          createButton(CLOSE_ON_ACCEPT_LABEL, closeOnAccept.onToggle, { isPressed: closeOnAccept.isEnabled }),
        ]),
      ]),
      ...(ai.status ? [createAiStatus(ai)] : []),
      ...suggestions.map((suggestion) =>
        createElement('div', { className: 'wb-card__item' }, [
          createHeader({ suggestion }),
          createChange(suggestion, suggestion.replacements[0]),
          createElement('p', { className: 'wb-card__explanation', text: suggestion.explanation }),
          createActions({ suggestion }, (type) => onAction(type, suggestion)),
        ]),
      ),
    ])

  const moveTo = (anchor) => {
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
