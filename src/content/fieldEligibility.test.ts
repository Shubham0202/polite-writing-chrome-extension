import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIELD_KINDS, SKIP_REASONS, getFieldSupport, type SkipReason } from './fieldEligibility.ts'

interface FakeElementOptions {
  localName?: string
  type?: string
  attributes?: Partial<Record<string, string>>
  isContentEditable?: boolean
  parentElement?: HTMLElement | null
  readOnly?: boolean
  disabled?: boolean
  closest?: () => object | null
}

// Just enough of an Element for the eligibility rules; `type` mirrors the browser's normalized input type.
const fakeElement = ({
  localName = 'div',
  type,
  attributes = {},
  isContentEditable = false,
  parentElement = null,
  ...rest
}: FakeElementOptions = {}): HTMLElement =>
  ({
    localName,
    type,
    isContentEditable,
    parentElement,
    readOnly: false,
    disabled: false,
    getAttribute: (name: string) => attributes[name] ?? null,
    closest: () => null,
    ...rest,
  }) as unknown as HTMLElement

const textInput = (attributes: Partial<Record<string, string>>): HTMLElement => fakeElement({ localName: 'input', type: 'text', attributes })

describe('field eligibility', () => {
  it('supports textareas, text and search inputs, and contenteditable elements', () => {
    assert.equal(getFieldSupport(fakeElement({ localName: 'textarea' }))!.kind, FIELD_KINDS.textarea)
    assert.equal(getFieldSupport(fakeElement({ localName: 'input', type: 'text' }))!.kind, FIELD_KINDS.input)
    assert.equal(getFieldSupport(fakeElement({ localName: 'input', type: 'search' }))!.kind, FIELD_KINDS.input)
    assert.equal(getFieldSupport(fakeElement({ isContentEditable: true }))!.kind, FIELD_KINDS.contentEditable)
  })

  it('ignores structured input types and elements that take no text', () => {
    for (const type of ['password', 'email', 'tel', 'url', 'number', 'date', 'checkbox', 'hidden']) {
      assert.equal(getFieldSupport(fakeElement({ localName: 'input', type })), null, type)
    }
    assert.equal(getFieldSupport(fakeElement({ localName: 'button' })), null)
    assert.equal(getFieldSupport(fakeElement()), null)
    assert.equal(getFieldSupport(null), null)
  })

  it('uses the outermost editing host when focus lands inside a nested editable region', () => {
    const host = fakeElement({ isContentEditable: true })
    const paragraph = fakeElement({ localName: 'p', isContentEditable: true, parentElement: host })
    const child = fakeElement({ localName: 'span', isContentEditable: true, parentElement: paragraph })
    assert.equal(getFieldSupport(child)!.field, host)
  })

  it('skips sensitive fields by autocomplete token or label', () => {
    for (const attributes of [
      { autocomplete: 'cc-number' },
      { autocomplete: 'shipping cc-exp' },
      { autocomplete: 'one-time-code' },
      { autocomplete: 'new-password' },
      { name: 'otp' },
      { id: 'user_pin' },
      { id: 'cardNumberInput' },
      { placeholder: 'Card number' },
      { placeholder: 'Enter your PIN' },
      { 'aria-label': 'CVV' },
      { name: 'iban' },
      { name: 'passwordConfirm' },
    ]) {
      assert.equal(getFieldSupport(textInput(attributes))!.skipReason, SKIP_REASONS.sensitive, JSON.stringify(attributes))
    }
  })

  it('does not mistake ordinary labels for sensitive ones', () => {
    for (const attributes of [
      { placeholder: 'Pinned note' },
      { name: 'opinion' },
      { id: 'footprint' },
      { name: 'shipping-notes' },
      { placeholder: 'Write a card notes message' },
      { autocomplete: 'off' },
    ]) {
      assert.equal(getFieldSupport(textInput(attributes))!.skipReason, null, JSON.stringify(attributes))
    }
  })

  it('names why other fields are skipped', () => {
    const cases: [HTMLElement, SkipReason][] = [
      [fakeElement({ localName: 'textarea', disabled: true }), SKIP_REASONS.disabled],
      [fakeElement({ localName: 'textarea', readOnly: true }), SKIP_REASONS.readOnly],
      [fakeElement({ localName: 'textarea', attributes: { spellcheck: 'false' } }), SKIP_REASONS.spellcheckOff],
      [fakeElement({ localName: 'textarea', attributes: { 'data-gramm': 'false' } }), SKIP_REASONS.assistantsOff],
      [fakeElement({ isContentEditable: true, closest: () => ({}) }), SKIP_REASONS.codeEditor],
    ]
    for (const [element, reason] of cases) assert.equal(getFieldSupport(element)!.skipReason, reason)
  })

  describe('on a site whose editors turn spellcheck off', () => {
    const siteAdapter = { checksRichTextWithSpellcheckOff: true }

    it('checks rich text there, and nowhere else', () => {
      const editor = fakeElement({ isContentEditable: true, attributes: { spellcheck: 'false' } })
      assert.equal(getFieldSupport(editor, siteAdapter)!.skipReason, null)
      assert.equal(getFieldSupport(editor)!.skipReason, SKIP_REASONS.spellcheckOff)
      assert.equal(getFieldSupport(editor, {})!.skipReason, SKIP_REASONS.spellcheckOff)
    })

    it('still skips plain inputs and textareas, such as search boxes', () => {
      for (const localName of ['input', 'textarea']) {
        const field = fakeElement({ localName, type: 'search', attributes: { spellcheck: 'false' } })
        assert.equal(getFieldSupport(field, siteAdapter)!.skipReason, SKIP_REASONS.spellcheckOff, localName)
      }
    })

    it('still respects an explicit opt-out and sensitive labels in rich text', () => {
      const optedOut = fakeElement({ isContentEditable: true, attributes: { spellcheck: 'false', 'data-gramm': 'false' } })
      const sensitive = fakeElement({ isContentEditable: true, attributes: { spellcheck: 'false', 'aria-label': 'Enter your PIN' } })
      assert.equal(getFieldSupport(optedOut, siteAdapter)!.skipReason, SKIP_REASONS.assistantsOff)
      assert.equal(getFieldSupport(sensitive, siteAdapter)!.skipReason, SKIP_REASONS.sensitive)
    })
  })

  describe('on a site whose editors turn writing assistants off', () => {
    const siteAdapter = { checksRichTextWithAssistantsOff: true }

    it('checks rich text there, and nowhere else', () => {
      const editor = fakeElement({ isContentEditable: true, attributes: { 'data-gramm': 'false' } })
      assert.equal(getFieldSupport(editor, siteAdapter)!.skipReason, null)
      assert.equal(getFieldSupport(editor)!.skipReason, SKIP_REASONS.assistantsOff)
    })

    it('still skips plain inputs and textareas that opt out', () => {
      for (const localName of ['input', 'textarea']) {
        const field = fakeElement({ localName, type: 'text', attributes: { 'data-gramm': 'false' } })
        assert.equal(getFieldSupport(field, siteAdapter)!.skipReason, SKIP_REASONS.assistantsOff, localName)
      }
    })

    it('still respects spellcheck off and sensitive labels in rich text', () => {
      const spellcheckOff = fakeElement({ isContentEditable: true, attributes: { 'data-gramm': 'false', spellcheck: 'false' } })
      const sensitive = fakeElement({ isContentEditable: true, attributes: { 'data-gramm': 'false', 'aria-label': 'Enter your PIN' } })
      assert.equal(getFieldSupport(spellcheckOff, siteAdapter)!.skipReason, SKIP_REASONS.spellcheckOff)
      assert.equal(getFieldSupport(sensitive, siteAdapter)!.skipReason, SKIP_REASONS.sensitive)
    })
  })

  it('checks a field whose spellcheck is explicitly on', () => {
    assert.equal(getFieldSupport(fakeElement({ localName: 'textarea', attributes: { spellcheck: 'true' } }))!.skipReason, null)
  })
})
