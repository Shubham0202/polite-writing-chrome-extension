import type { SiteAdapter } from './siteAdapters.ts'

export const FIELD_KINDS = Object.freeze({
  input: 'input',
  textarea: 'textarea',
  contentEditable: 'contenteditable',
})

export type FieldKind = (typeof FIELD_KINDS)[keyof typeof FIELD_KINDS]

// The element each kind of field is, so that code working on one kind can use its members.
export interface FieldElementByKind {
  [FIELD_KINDS.input]: HTMLInputElement
  [FIELD_KINDS.textarea]: HTMLTextAreaElement
  [FIELD_KINDS.contentEditable]: HTMLElement
}

export const SKIP_REASONS = Object.freeze({
  disabled: 'disabled',
  readOnly: 'read-only',
  sensitive: 'sensitive',
  spellcheckOff: 'spellcheck off',
  assistantsOff: 'writing assistants turned off',
  codeEditor: 'code editor',
})

export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS]

export interface FieldSupport {
  field: HTMLElement
  kind: FieldKind
  skipReason: SkipReason | null
}

// What the rules read; only some elements have each member.
type RuleField = HTMLElement & Partial<Pick<HTMLInputElement, 'disabled' | 'readOnly'>>
type CandidateElement = HTMLElement & Partial<Pick<HTMLInputElement, 'type'>>
type SkipRule = readonly [SkipReason, (field: RuleField) => boolean]
type RichTextOverrideOption = Exclude<keyof SiteAdapter, 'excludedSelector'>

// Password, email, number, date and other structured input types never hold free text.
const TEXT_INPUT_TYPES = new Set<string | undefined>(['text', 'search'])
// Payment details, one-time codes and passwords can also sit in plain text inputs.
const SENSITIVE_AUTOCOMPLETE_PATTERN = /^(?:cc-[a-z-]+|one-time-code|current-password|new-password)$/
const SENSITIVE_LABEL_PATTERN =
  /passw|passcode|card.?(?:number|num)|card.?no\b|credit.?card|debit.?card|security.?code|(?:^|[^a-z])(?:cvv|cvc|csc|otp|pin|ssn|iban)(?:[^a-z]|$)/i
const LABEL_ATTRIBUTES = ['name', 'id', 'aria-label', 'placeholder']
// Sites already set these to keep writing assistants out of a field.
const ASSISTANT_OPT_OUT_ATTRIBUTES = ['data-gramm', 'data-gramm_editor', 'data-enable-grammarly']
const CODE_EDITOR_SELECTOR = '.monaco-editor, .CodeMirror, .cm-editor, .ace_editor'

const hasSensitiveAutocomplete = (field: HTMLElement): boolean =>
  (field.getAttribute('autocomplete') ?? '')
    .toLowerCase()
    .split(/\s+/)
    .some((token) => SENSITIVE_AUTOCOMPLETE_PATTERN.test(token))

const hasSensitiveLabel = (field: HTMLElement): boolean => LABEL_ATTRIBUTES.some((name) => SENSITIVE_LABEL_PATTERN.test(field.getAttribute(name) ?? ''))

// Checked in order; the first match names the reason.
const SKIP_RULES: SkipRule[] = [
  [SKIP_REASONS.disabled, (field) => field.disabled === true],
  [SKIP_REASONS.readOnly, (field) => field.readOnly === true],
  [SKIP_REASONS.sensitive, (field) => hasSensitiveAutocomplete(field) || hasSensitiveLabel(field)],
  [SKIP_REASONS.spellcheckOff, (field) => field.getAttribute('spellcheck') === 'false'],
  [SKIP_REASONS.assistantsOff, (field) => ASSISTANT_OPT_OUT_ATTRIBUTES.some((name) => field.getAttribute(name) === 'false')],
  [SKIP_REASONS.codeEditor, (field) => field.closest(CODE_EDITOR_SELECTOR) !== null],
]

// Site adapter options for sites that put an opt-out on every rich-text editor they have, so it says nothing about
// the field. Plain inputs on those sites still respect it.
const RICH_TEXT_OVERRIDES: Record<RichTextOverrideOption, SkipReason> = {
  checksRichTextWithSpellcheckOff: SKIP_REASONS.spellcheckOff,
  checksRichTextWithAssistantsOff: SKIP_REASONS.assistantsOff,
}

const getOverriddenReasons = (kind: FieldKind, siteAdapter: SiteAdapter): SkipReason[] =>
  kind === FIELD_KINDS.contentEditable
    ? Object.entries(RICH_TEXT_OVERRIDES).filter(([option]) => siteAdapter[option as RichTextOverrideOption]).map(([, reason]) => reason)
    : []

const getFieldKind = (element: CandidateElement): FieldKind | null => {
  if (element.localName === 'textarea') return FIELD_KINDS.textarea
  if (element.localName === 'input') return TEXT_INPUT_TYPES.has(element.type) ? FIELD_KINDS.input : null
  return element.isContentEditable ? FIELD_KINDS.contentEditable : null
}

// Focus can land on a nested editable region; its text belongs to the outermost editing host.
const findEditingHost = (element: HTMLElement): HTMLElement => {
  let host = element
  while (host.parentElement?.isContentEditable) host = host.parentElement
  return host
}

// Returns the field to check, its kind and why it is skipped (null when it is not),
// or null when the element does not take free text at all.
export const getFieldSupport = (element: CandidateElement | null, siteAdapter: SiteAdapter = {}): FieldSupport | null => {
  const kind = element ? getFieldKind(element) : null
  if (!kind) return null

  const field = kind === FIELD_KINDS.contentEditable ? findEditingHost(element!) : element!
  const overriddenReasons = getOverriddenReasons(kind, siteAdapter)
  const skipRule = SKIP_RULES.find(([reason, matches]) => !overriddenReasons.includes(reason) && matches(field))
  return { field, kind, skipReason: skipRule?.[0] ?? null }
}
