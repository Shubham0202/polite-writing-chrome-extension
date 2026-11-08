import { ENGINES, TONES } from '../constants/corrections.js'
import { MESSAGE_TYPES, sendMessage } from '../services/messaging.js'
import { createFieldLocator, findClippingAncestors, getVisibleBox } from './fieldLocator.js'
import { createAiAnswer, describeAiAnswer, followCardChange, isAnswerFor } from './aiAnswers.js'
import { readFieldText } from './fieldText.js'
import { createSuggestionActions } from './suggestionActions.js'
import { createSuggestionCardController } from './suggestionCardController.js'
import { CARD_SOURCES, createSuggestionOpeners } from './suggestionOpeners.js'
import {
  createSuggestionState,
  excludeDismissed,
  getDisplaySpan,
  getReviewItems,
  getSuggestionKey,
  hasReviewItems,
  rebaseSuggestionState,
} from './suggestionState.js'
import { createChangeToast } from './ui/changeToast.js'
import { createFieldBadge } from './ui/fieldBadge.js'
import { createInlineRoot } from './ui/inlineRoot.js'
import { AI_STATUS_KINDS } from './ui/suggestionCard.js'
import { createUnderlineLayer } from './ui/underlineLayer.js'

const PENDING_MESSAGE = 'Rewriting with AI…'
// A field whose AI rewrite arrives before any check result gets an empty one, so both are kept and rebased the same way.
const EMPTY_TONE_ALTERNATIVES = Object.fromEntries(Object.values(TONES).map((tone) => [tone, []]))

const describeSuggestions = (state) => {
  const reviewCount = getReviewItems(state).length
  if (state.corrections.length || state.aiRewrites.length) {
    return { label: String(reviewCount), description: `WriteBetter: ${reviewCount} writing ${reviewCount === 1 ? 'suggestion' : 'suggestions'}` }
  }
  return { label: 'W', description: `WriteBetter: ${reviewCount} ${reviewCount === 1 ? 'sentence' : 'sentences'} can be rewritten` }
}

// Draws suggestions for the active field. Nothing is added to the page until the first suggestion needs showing.
export const createInlineSuggestionManager = () => {
  const results = new WeakMap()
  const dismissals = new WeakMap()
  let ui = null
  let session = null
  let frame = null
  let needsSync = false
  // The shortcut's AI rewrite: whether it is on, the style to ask for, and how to flip the switch in Settings.
  let aiShortcut = { isEnabled: false, style: null, onToggle: () => {} }
  // Whether every Accept closes the list, and how to flip that switch in Settings.
  let closeOnAccept = { isEnabled: false, onToggle: () => {} }
  // The AI rewrite in flight for the active field, if any.
  let aiRequest = null
  // Each field's last AI answer, so the same text is not sent again unless the user asks with Regenerate.
  const aiAnswers = new WeakMap()

  const hideEverything = () => {
    ui?.underlines.hide()
    ui?.badge.hide()
  }

  const createVisibleState = (result) => excludeDismissed(createSuggestionState(result), dismissals.get(session.field))

  const getRects = (suggestion) => session.locator.getRects(...getDisplaySpan(suggestion, session.state.text))
  const getAnchor = (suggestion) => getRects(suggestion).at(-1) ?? ui.badge.getRect()

  const measureMarks = (openSuggestion) => {
    const marks = session.state.corrections.map((suggestion) => ({
      suggestion,
      rects: getRects(suggestion),
      isActive: suggestion.id === openSuggestion?.id,
    }))
    return openSuggestion?.engine === ENGINES.tone ? [...marks, { suggestion: openSuggestion, rects: getRects(openSuggestion), isActive: true }] : marks
  }

  // The AI row follows what is left of the answer as items are accepted and dismissed. Only the first wording of it is
  // announced, so this runs on every frame without repeating itself to screen readers.
  const updateAiAnswerMessage = () => {
    const { aiStatus, state } = session
    if (aiStatus?.kind !== AI_STATUS_KINDS.answer) return
    aiStatus.message = describeAiAnswer({ isEarlier: aiStatus.isEarlier, visibleCount: state?.aiRewrites.length ?? 0, message: aiStatus.answerMessage })
  }

  const render = () => {
    if (!session) return
    updateAiAnswerMessage()
    const { field, state, notice, clippingAncestors } = session
    if (!state && !notice) {
      // The list can be open for an AI rewrite before any check result exists.
      ui?.card.refresh()
      return hideEverything()
    }

    const box = getVisibleBox(field, clippingAncestors)
    if (!box) return hideEverything()
    if (notice) return ui.badge.render(box, notice)
    if (!hasReviewItems(state)) {
      session.marks = null
      // The list closes itself once nothing is left to review.
      ui.card.refresh()
      return hideEverything()
    }

    const openSuggestion = ui.card.getOpenSuggestion()
    session.marks = measureMarks(openSuggestion)
    ui.underlines.render(box, session.marks)
    ui.badge.render(box, describeSuggestions(state))
    ui.card.refresh()
  }

  // Puts the UI in place for the active field. Nothing is added to the page before this.
  const mount = () => {
    ui ??= createUi()
    ui.root.mountFor(session.field)
    session.locator ??= createFieldLocator(session.field, session.kind, ui.root.mirror)
    session.clippingAncestors ??= findClippingAncestors(session.field)
    startTracking()
  }

  const present = (result) => {
    mount()
    session.state = createVisibleState(result)
    session.notice = null
    session.locator.refresh()
    if (!aiRequest) ui.root.status.textContent = describeSuggestions(session.state).description
    render()
  }

  const setAiStatus = (status) => {
    session.aiStatus = status
    if (status) ui.root.status.textContent = `WriteBetter: ${status.message}`
  }

  const cancelAiRewrite = () => {
    if (!aiRequest) return
    aiRequest = null
    sendMessage(MESSAGE_TYPES.cancelRewrite).catch(() => {})
  }

  const failAiRewrite = (message) => {
    aiRequest = null
    setAiStatus({ kind: AI_STATUS_KINDS.error, message })
    render()
  }

  // The local suggestions that go with `text`: the latest check result, or the current state when that is newer.
  const getBaseResult = (text) => {
    const stored = results.get(session.field)
    if (stored?.original === text) return stored
    const { state } = session
    if (state?.text === text) return { original: text, suggestions: state.corrections, toneAlternatives: state.toneAlternatives }
    return { original: text, suggestions: [], toneAlternatives: EMPTY_TONE_ALTERNATIVES }
  }

  // The rewrite joins the field's stored result, so it is rebased, dismissed and shown again like local suggestions.
  const showAiRewrites = (text, aiRewrites) => {
    results.set(session.field, { ...getBaseResult(text), aiRewrites })
    present(results.get(session.field))
  }

  const showAiAnswer = (answer, { isEarlier }) => {
    const visibleCount = session.state?.aiRewrites.length ?? 0
    const message = describeAiAnswer({ isEarlier, visibleCount, message: answer.message })
    setAiStatus({ kind: AI_STATUS_KINDS.answer, isEarlier, answerMessage: answer.message, message })
    render()
  }

  const receiveAiResult = (result, request) => {
    aiRequest = null
    const { field, kind } = session
    // Typing cancels the request, but a site can also change the field on its own.
    if (readFieldText(field, kind) !== request.text) {
      setAiStatus(null)
      return render()
    }
    const answer = createAiAnswer({ text: request.text, style: request.style, result })
    aiAnswers.set(field, answer)
    showAiRewrites(request.text, answer.suggestions)
    showAiAnswer(answer, { isEarlier: false })
    // A keyboard user lands on the AI's first Accept, at the top of the list, so Enter takes it.
    if (request.moveFocus || ui.card.hasFocus()) ui.card.focusPrimaryButton()
  }

  // Sends the field's text for an AI rewrite. Only ever reached from an explicit key press or click.
  const startAiRewrite = ({ moveFocus = false } = {}) => {
    cancelAiRewrite()
    const text = readFieldText(session.field, session.kind)
    const request = (aiRequest = { text, style: aiShortcut.style, moveFocus })
    setAiStatus({ kind: AI_STATUS_KINDS.pending, message: PENDING_MESSAGE })
    sendMessage(MESSAGE_TYPES.runRewrite, { text, style: request.style }).then(
      (result) => aiRequest === request && receiveAiResult(result, request),
      (error) => aiRequest === request && failAiRewrite(error.message),
    )
    render()
  }

  // Shows the AI's earlier answer when it still fits the text and style; otherwise asks the AI.
  const showOrStartAiRewrite = ({ moveFocus = false } = {}) => {
    const text = readFieldText(session.field, session.kind)
    const answer = aiAnswers.get(session.field)
    if (!isAnswerFor(answer, { text, style: aiShortcut.style })) return startAiRewrite({ moveFocus })
    cancelAiRewrite()
    // Unchanged text gets the whole answer back, even parts that edits had dropped since; after an Accept on the
    // card, the rebased rest is already in the state.
    if (text === answer.text) showAiRewrites(text, answer.suggestions)
    showAiAnswer(answer, { isEarlier: true })
  }

  // Changes made on the card keep the AI's answer current; only typing makes the next shortcut ask the AI again.
  const handleCardAction = async (action) => {
    const { field, kind } = session
    const before = readFieldText(field, kind)
    await ui.actions.handleAction(action)
    aiAnswers.set(field, followCardChange(aiAnswers.get(field), before, readFieldText(field, kind)))
  }

  const syncWithText = () => {
    const { field, kind, state } = session
    const stored = results.get(field)
    if (!stored && !aiRequest) return

    const text = readFieldText(field, kind)
    // A rewrite of text that has since changed would no longer fit; typing cancels it.
    if (aiRequest && text !== aiRequest.text) {
      cancelAiRewrite()
      setAiStatus(null)
    }
    if (!stored) return

    ui?.actions.handleTextChanged(text)
    if (text === stored.original) {
      if (hasReviewItems(createVisibleState(stored)) && state?.text !== text) present(stored)
    } else if (state && text !== state.text) {
      ui.card.handleTextChanged()
      session.state = rebaseSuggestionState(state, text)
    }
    session.locator?.refresh()
  }

  const requestFrame = ({ sync = false } = {}) => {
    needsSync ||= sync
    frame ??= requestAnimationFrame(() => {
      frame = null
      const shouldSync = needsSync
      needsSync = false
      if (!session) return
      if (shouldSync) syncWithText()
      render()
    })
  }

  const handleLayoutChange = () => requestFrame({ sync: true })

  const handleScroll = () => requestFrame()

  const dismiss = (suggestion) => {
    const dismissedKeys = dismissals.get(session.field) ?? new Set()
    dismissals.set(session.field, dismissedKeys.add(getSuggestionKey(suggestion)))
    session.state = excludeDismissed(session.state, dismissedKeys)
    render()
  }

  const createUi = () => {
    const root = createInlineRoot()
    const getSession = () => session
    const actions = createSuggestionActions({
      getSession,
      toast: createChangeToast(root.shadowRoot),
      onDismiss: dismiss,
      onAnnounce: (message) => {
        root.status.textContent = message
      },
    })
    const card = createSuggestionCardController({
      parent: root.shadowRoot,
      host: root.host,
      getSession,
      getAnchor,
      getFieldAnchor: () => getVisibleBox(session.field, session.clippingAncestors) ?? session.field.getBoundingClientRect(),
      getAiShortcut: () => ({ isEnabled: aiShortcut.isEnabled, onToggle: aiShortcut.onToggle, onRegenerate: () => startAiRewrite({ moveFocus: ui.card.hasFocus() }) }),
      getCloseOnAccept: () => closeOnAccept,
      onChange: render,
      onAction: handleCardAction,
      onEscape: (id) => ui.openers.suppress(id),
      // Nothing is waited for once the list is gone.
      onClose: () => {
        cancelAiRewrite()
        if (session) session.aiStatus = null
      },
    })
    const openers = createSuggestionOpeners({ host: root.host, getSession, card })
    return {
      root,
      card,
      actions,
      openers,
      underlines: createUnderlineLayer(root.shadowRoot),
      badge: createFieldBadge(root.shadowRoot, { onOpen: openers.handleBadgeClick }),
    }
  }

  const startTracking = () => {
    if (session.tracking) return
    session.tracking = new AbortController()
    const { signal } = session.tracking
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true, signal })
    window.addEventListener('resize', handleLayoutChange, { passive: true, signal })
    document.addEventListener('mousemove', ui.openers.handleMouseMove, { passive: true, signal })
    session.field.addEventListener('click', ui.openers.handleClick, { signal })
    session.field.addEventListener('keyup', ui.openers.handleKeyUp, { signal })

    const resizeObserver = new ResizeObserver(handleLayoutChange)
    resizeObserver.observe(session.field)
    signal.addEventListener('abort', () => resizeObserver.disconnect())
  }

  const stopTracking = () => {
    session.tracking?.abort()
    session.tracking = null
    ui?.openers.cancelHover()
  }

  const clearField = () => {
    ui?.card.close()
    stopTracking()
    cancelAiRewrite()
    session.state = null
    session.notice = null
    session.aiStatus = null
    session.marks = null
    hideEverything()
  }

  const clear = () => {
    if (!session) return
    results.delete(session.field)
    clearField()
  }

  const showResult = (result) => {
    if (!session) return
    const { field, kind, state } = session
    // Sites can change a field's value without any event, so a result is only trusted if it still matches.
    if (readFieldText(field, kind) !== result.original) return
    // AI rewrites of this same text stay; the rebased state has their current offsets.
    const stored = { ...result, aiRewrites: state?.text === result.original ? state.aiRewrites : [] }
    results.set(field, stored)

    // A rewrite still on its way needs the field's UI to arrive into.
    if (hasReviewItems(createVisibleState(stored)) || aiRequest) present(stored)
    else clearField()
  }

  const showNotice = (message) => {
    if (!session) return
    clear()
    ui ??= createUi()
    ui.root.mountFor(session.field)
    session.notice = { label: '!', description: `WriteBetter: ${message}` }
    session.clippingAncestors ??= findClippingAncestors(session.field)
    startTracking()
    render()
  }

  const handleTextChanged = () => {
    if (session && (results.has(session.field) || aiRequest)) requestFrame({ sync: true })
  }

  const openListWithAiRewrite = () => {
    mount()
    showOrStartAiRewrite({ moveFocus: true })
    ui.card.openAll({ source: CARD_SOURCES.keyboard, moveFocus: true })
  }

  const attach = (field, kind) => {
    session = { field, kind, state: null, notice: null, aiStatus: null, locator: null, clippingAncestors: null, marks: null, tracking: null }
    const stored = results.get(field)
    if (stored && readFieldText(field, kind) === stored.original && hasReviewItems(createVisibleState(stored))) present(stored)
  }

  const detach = () => {
    if (!session) return
    clearField()
    ui?.actions.reset()
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    needsSync = false
    session = null
  }

  const destroy = () => {
    detach()
    ui?.root.host.remove()
    ui = null
  }

  return {
    attach,
    detach,
    destroy,
    showResult,
    showNotice,
    clear,
    handleTextChanged,
    openFromKeyboard: () => {
      if (session?.state) ui.openers.openFromKeyboard()
    },
    openAllFromKeyboard: () => {
      if (!session) return
      // Pressed again, the shortcut puts the list away.
      if (ui?.card.isListOpen()) return ui.card.close()
      if (aiShortcut.isEnabled) return openListWithAiRewrite()
      if (session.state) ui.openers.openAllFromKeyboard()
    },
    setAiShortcut: (config) => {
      const wasEnabled = aiShortcut.isEnabled
      aiShortcut = config
      if (!session || !ui) return
      if (wasEnabled && !config.isEnabled) {
        cancelAiRewrite()
        setAiStatus(null)
      }
      // Switched on from the open list: the user is waiting for the rewrite right there.
      if (!wasEnabled && config.isEnabled && ui.card.isListOpen()) showOrStartAiRewrite()
      render()
    },
    setCloseOnAccept: (config) => {
      closeOnAccept = config
      if (session && ui) render()
    },
    isOwnElement: (element) => element !== null && element === ui?.root.host,
  }
}
