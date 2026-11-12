/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { AI_NOT_CONFIGURED_MESSAGE, type RewriteStyle } from '../constants/ai.ts'
import { ENGINES, TONES } from '../constants/corrections.ts'
import type { IdentifiedSuggestion } from '../engines/suggestion.ts'
import type { InlineCheckResult, ToneAlternatives } from '../services/correctionPipeline.ts'
import { MESSAGE_TYPES, sendMessage } from '../services/messaging.ts'
import type { ColorScheme } from '../services/theme.ts'
import type { RewriteResult } from '../services/writingEnhancer.ts'
import { createFieldLocator, findClippingAncestors, getVisibleBox } from './fieldLocator.ts'
import { createAiAnswer, describeAiAnswer, followCardChange, isAnswerFor, type AiAnswer } from './aiAnswers.ts'
import { readFieldText } from './fieldText.ts'
import type { FIELD_KINDS } from './fieldEligibility.ts'
import { createSuggestionActions, type CardActionRequest, type SuggestionActions } from './suggestionActions.ts'
import { createSuggestionCardController, type SuggestionCardController } from './suggestionCardController.ts'
import { CARD_SOURCES, createSuggestionOpeners, type SuggestionOpeners } from './suggestionOpeners.ts'
import {
  createSuggestionState,
  excludeDismissed,
  getDisplaySpan,
  getReviewItems,
  getSuggestionKey,
  hasReviewItems,
  rebaseSuggestionState,
  type StoredCheckResult,
  type SuggestionState,
} from './suggestionState.ts'
import { createChangeToast } from './ui/changeToast.ts'
import { createFieldBadge, type BadgeContent, type FieldBadge } from './ui/fieldBadge.ts'
import { createInlineRoot, type InlineRoot } from './ui/inlineRoot.ts'
import { AI_STATUS_KINDS, type AiStatus, type ToggleSetting } from './ui/suggestionCard.ts'
import { createUnderlineLayer, type UnderlineLayer, type UnderlineMark } from './ui/underlineLayer.ts'

type FieldKind = (typeof FIELD_KINDS)[keyof typeof FIELD_KINDS]
type FieldLocator = ReturnType<typeof createFieldLocator>
type ClippingAncestors = ReturnType<typeof findClippingAncestors>

// Everything known about the active field. The locator and the clipping ancestors arrive when the UI is first mounted.
export interface InlineSession {
  field: HTMLElement
  kind: FieldKind
  state: SuggestionState | null
  notice: BadgeContent | null
  aiStatus: AiStatus | null
  locator: FieldLocator | null
  clippingAncestors: ClippingAncestors | null
  marks: UnderlineMark[] | null
  tracking: AbortController | null
}

// The shortcut's AI rewrite settings. The style is null until the settings have been read. Only whether a key is saved
// is known here, so the card can point to Settings instead of sending a request that would fail.
export interface AiShortcutConfig extends ToggleSetting {
  style: RewriteStyle | null
  isConfigured: boolean
  onStyleChange: (style: RewriteStyle) => void
  onOpenSettings: () => void
}

interface AiRequest {
  text: string
  style: RewriteStyle | null
  moveFocus: boolean
}

interface InlineUi {
  root: InlineRoot
  card: SuggestionCardController
  actions: SuggestionActions
  openers: SuggestionOpeners
  underlines: UnderlineLayer
  badge: FieldBadge
}

export interface InlineSuggestionManager {
  attach: (field: HTMLElement, kind: FieldKind) => void
  detach: () => void
  destroy: () => void
  showResult: (result: InlineCheckResult) => void
  showNotice: (message: string) => void
  clear: () => void
  handleTextChanged: () => void
  openFromKeyboard: () => void
  openAllFromKeyboard: () => void
  setAiShortcut: (config: AiShortcutConfig) => void
  setCloseOnAccept: (config: ToggleSetting) => void
  setColorScheme: (colorScheme: ColorScheme) => void
  isOwnElement: (element: Node | null) => boolean
}

const PENDING_MESSAGE = 'Rewriting with AI…'
// A field whose AI rewrite arrives before any check result gets an empty one, so both are kept and rebased the same way.
const EMPTY_TONE_ALTERNATIVES = Object.fromEntries(Object.values(TONES).map((tone) => [tone, []])) as unknown as ToneAlternatives

const describeSuggestions = (state: SuggestionState): BadgeContent => {
  const reviewCount = getReviewItems(state).length
  if (state.corrections.length || state.aiRewrites.length) {
    return { label: String(reviewCount), description: `WriteBetter: ${reviewCount} writing ${reviewCount === 1 ? 'suggestion' : 'suggestions'}` }
  }
  return { label: 'W', description: `WriteBetter: ${reviewCount} ${reviewCount === 1 ? 'sentence' : 'sentences'} can be rewritten` }
}

// Draws suggestions for the active field. Nothing is added to the page until the first suggestion needs showing.
export const createInlineSuggestionManager = (): InlineSuggestionManager => {
  const results = new WeakMap<HTMLElement, StoredCheckResult>()
  const dismissals = new WeakMap<HTMLElement, Set<string>>()
  let ui: InlineUi = null!
  let session: InlineSession = null!
  let frame: number | null = null
  let needsSync = false
  // The shortcut's AI rewrite: whether it is on, the style to ask for, and how to flip the switch in Settings.
  let aiShortcut: AiShortcutConfig = { isEnabled: false, style: null, isConfigured: false, onToggle: () => {}, onStyleChange: () => {}, onOpenSettings: () => {} }
  // Whether every Accept closes the list, and how to flip that switch in Settings.
  let closeOnAccept: ToggleSetting = { isEnabled: false, onToggle: () => {} }
  // The Theme setting, already resolved from System to light or dark; the stylesheet reads it off the host.
  let colorScheme: ColorScheme | null = null
  // The AI rewrite in flight for the active field, if any.
  let aiRequest: AiRequest | null = null
  // Each field's last AI answer, so the same text is not sent again unless the user asks with Regenerate.
  const aiAnswers = new WeakMap<HTMLElement, AiAnswer | undefined>()

  const hideEverything = () => {
    ui?.underlines.hide()
    ui?.badge.hide()
  }

  const createVisibleState = (result: StoredCheckResult) => excludeDismissed(createSuggestionState(result), dismissals.get(session.field))

  const getRects = (suggestion: IdentifiedSuggestion) => session.locator!.getRects(...getDisplaySpan(suggestion, session.state!.text))
  const getAnchor = (suggestion: IdentifiedSuggestion) => getRects(suggestion).at(-1) ?? ui.badge.getRect()

  const measureMarks = (openSuggestion: IdentifiedSuggestion | null): UnderlineMark[] => {
    const marks = session.state!.corrections.map((suggestion) => ({
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

    const box = getVisibleBox(field, clippingAncestors!)
    if (!box) return hideEverything()
    if (notice) return ui.badge.render(box, notice)
    if (!hasReviewItems(state!)) {
      session.marks = null
      // The list closes itself once nothing is left to review.
      ui.card.refresh()
      return hideEverything()
    }

    const openSuggestion = ui.card.getOpenSuggestion()
    session.marks = measureMarks(openSuggestion)
    ui.underlines.render(box, session.marks)
    ui.badge.render(box, describeSuggestions(state!))
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

  const present = (result: StoredCheckResult) => {
    mount()
    session.state = createVisibleState(result)
    session.notice = null
    session.locator!.refresh()
    if (!aiRequest) ui.root.status.textContent = describeSuggestions(session.state).description
    render()
  }

  const setAiStatus = (status: AiStatus | null) => {
    session.aiStatus = status
    if (status) ui.root.status.textContent = `WriteBetter: ${status.message}`
  }

  const cancelAiRewrite = () => {
    if (!aiRequest) return
    aiRequest = null
    sendMessage(MESSAGE_TYPES.cancelRewrite).catch(() => {})
  }

  const failAiRewrite = (message: string) => {
    aiRequest = null
    setAiStatus({ kind: AI_STATUS_KINDS.error, message })
    render()
  }

  // The local suggestions that go with `text`: the latest check result, or the current state when that is newer.
  const getBaseResult = (text: string): StoredCheckResult => {
    const stored = results.get(session.field)
    if (stored?.original === text) return stored
    const { state } = session
    if (state?.text === text) return { original: text, suggestions: state.corrections, toneAlternatives: state.toneAlternatives }
    return { original: text, suggestions: [], toneAlternatives: EMPTY_TONE_ALTERNATIVES }
  }

  // The rewrite joins the field's stored result, so it is rebased, dismissed and shown again like local suggestions.
  const showAiRewrites = (text: string, aiRewrites: IdentifiedSuggestion[]) => {
    results.set(session.field, { ...getBaseResult(text), aiRewrites })
    present(results.get(session.field)!)
  }

  const showAiAnswer = (answer: AiAnswer, { isEarlier }: { isEarlier: boolean }) => {
    const visibleCount = session.state?.aiRewrites.length ?? 0
    const message = describeAiAnswer({ isEarlier, visibleCount, message: answer.message })
    setAiStatus({ kind: AI_STATUS_KINDS.answer, isEarlier, answerMessage: answer.message, message })
    render()
  }

  const receiveAiResult = (result: RewriteResult, request: AiRequest) => {
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

  // Without a key the request could only fail, so the card shows the way to Settings instead.
  const showAiSetup = () => {
    setAiStatus({ kind: AI_STATUS_KINDS.setup, message: AI_NOT_CONFIGURED_MESSAGE })
    render()
  }

  // Sends the field's text for an AI rewrite. Only ever reached from an explicit key press or click.
  const startAiRewrite = ({ moveFocus = false }: { moveFocus?: boolean } = {}) => {
    if (!aiShortcut.isConfigured) return showAiSetup()
    cancelAiRewrite()
    const text = readFieldText(session.field, session.kind)
    const request = (aiRequest = { text, style: aiShortcut.style, moveFocus })
    setAiStatus({ kind: AI_STATUS_KINDS.pending, message: PENDING_MESSAGE })
    sendMessage(MESSAGE_TYPES.runRewrite, { text, style: request.style! }).then(
      (result) => aiRequest === request && receiveAiResult(result, request),
      (error: Error) => aiRequest === request && failAiRewrite(error.message),
    )
    render()
  }

  // Shows the AI's earlier answer when it still fits the text and style; otherwise asks the AI.
  const showOrStartAiRewrite = ({ moveFocus = false }: { moveFocus?: boolean } = {}) => {
    const text = readFieldText(session.field, session.kind)
    const answer = aiAnswers.get(session.field)
    if (!isAnswerFor(answer, { text, style: aiShortcut.style })) return startAiRewrite({ moveFocus })
    cancelAiRewrite()
    // Unchanged text gets the whole answer back, even parts that edits had dropped since; after an Accept on the
    // card, the rebased rest is already in the state.
    if (text === answer.text) showAiRewrites(text, answer.suggestions)
    showAiAnswer(answer, { isEarlier: true })
  }

  // The AI switch on either card. Rewrites are shown in the list, so switching on from the single card opens it; the
  // request starts once the stored setting comes back on.
  const toggleAiShortcut = () => {
    if (!aiShortcut.isEnabled && !aiShortcut.isConfigured) return showAiSetup()
    if (!aiShortcut.isEnabled && !ui.card.isListOpen()) ui.card.openAll({ source: ui.card.getSource() ?? CARD_SOURCES.badge, moveFocus: ui.card.hasFocus() })
    aiShortcut.onToggle()
  }

  // Changes made on the card keep the AI's answer current; only typing makes the next shortcut ask the AI again.
  const handleCardAction = async (action: CardActionRequest) => {
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

  const requestFrame = ({ sync = false }: { sync?: boolean } = {}) => {
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

  const dismiss = (suggestion: IdentifiedSuggestion) => {
    const dismissedKeys = dismissals.get(session.field) ?? new Set<string>()
    dismissals.set(session.field, dismissedKeys.add(getSuggestionKey(suggestion)))
    session.state = excludeDismissed(session.state!, dismissedKeys)
    render()
  }

  const createUi = (): InlineUi => {
    const root = createInlineRoot()
    if (colorScheme) root.host.dataset.theme = colorScheme
    const getSession = () => session
    const actions = createSuggestionActions({
      getSession,
      toast: createChangeToast(root.shadowRoot),
      onDismiss: dismiss,
      onAnnounce: (message: string) => {
        root.status.textContent = message
      },
    })
    const card = createSuggestionCardController({
      parent: root.shadowRoot,
      host: root.host,
      getSession,
      getAnchor,
      getFieldAnchor: () => getVisibleBox(session.field, session.clippingAncestors!) ?? session.field.getBoundingClientRect(),
      getAiShortcut: () => ({ ...aiShortcut, onToggle: toggleAiShortcut, onRegenerate: () => startAiRewrite({ moveFocus: ui.card.hasFocus() }) }),
      getCloseOnAccept: () => closeOnAccept,
      onChange: render,
      onAction: handleCardAction,
      onEscape: (id: string) => ui.openers.suppress(id),
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

  const showResult = (result: InlineCheckResult) => {
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

  const showNotice = (message: string) => {
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

  const attach = (field: HTMLElement, kind: FieldKind) => {
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
    session = null!
  }

  const destroy = () => {
    detach()
    ui?.root.host.remove()
    ui = null!
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
    setAiShortcut: (config: AiShortcutConfig) => {
      const previous = aiShortcut
      aiShortcut = config
      if (!session || !ui) return
      if (previous.isEnabled && !config.isEnabled) {
        cancelAiRewrite()
        setAiStatus(null)
      }
      // A key saved meanwhile makes the way to Settings unnecessary.
      if (config.isConfigured && session.aiStatus?.kind === AI_STATUS_KINDS.setup) setAiStatus(null)
      // Switched on, or given another style, from the open list in this page: the user is waiting for the rewrite right
      // there. Every tab hears the change, so a list left open in another tab or frame, or a change made in Settings,
      // must not send that field's text.
      const isNewAnswerWanted = config.isEnabled && (!previous.isEnabled || config.style !== previous.style)
      if (isNewAnswerWanted && ui.card.isListOpen() && document.hasFocus()) showOrStartAiRewrite()
      render()
    },
    setCloseOnAccept: (config: ToggleSetting) => {
      closeOnAccept = config
      if (session && ui) render()
    },
    setColorScheme: (newColorScheme: ColorScheme) => {
      colorScheme = newColorScheme
      if (ui) ui.root.host.dataset.theme = newColorScheme
    },
    isOwnElement: (element: Node | null) => element !== null && element === ui?.root.host,
  }
}
