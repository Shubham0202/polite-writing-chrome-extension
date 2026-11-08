import { DEFAULT_SETTINGS } from '../constants/settings.js'
import { FIELD_KINDS } from './fieldEligibility.js'
import { readFieldText } from './fieldText.js'

// Reports the watched field's text once it stops changing, never on every keystroke. Each report carries a signal that is aborted as soon as
// the text changes again or the field is left, so work on outdated text can stop. `onTextReady` resolves when that
// work is done; only text whose work finished without being aborted, and did not resolve to false, is skipped as already checked.
// `onTextChanged` fires on every change, for work that cannot wait for the pause.
export const createTextChangeDetector = ({ onTextReady, onTextChanged, getDelayMs = () => DEFAULT_SETTINGS.delayMs }) => {
  let checkedTexts = new WeakMap()
  let stopWatching = null
  let requestCheck = null

  const unwatch = () => {
    stopWatching?.()
    stopWatching = null
    requestCheck = null
  }

  // After the checks themselves change, text that was already checked needs checking again.
  const recheck = () => {
    checkedTexts = new WeakMap()
    requestCheck?.()
  }

  const watch = (field, kind) => {
    unwatch()
    const listeners = new AbortController()
    let timer = null
    let processing = null
    let isComposing = false

    const cancelProcessing = () => {
      processing?.abort()
      processing = null
    }

    const processText = async () => {
      timer = null
      const text = readFieldText(field, kind)
      if (text === (checkedTexts.get(field) ?? '')) return

      const run = new AbortController()
      processing = run
      const isChecked = await onTextReady({ field, kind, text, signal: run.signal })
      if (run.signal.aborted) return
      processing = null
      // A check that could not run (the service worker was unavailable) must run again next time.
      if (isChecked !== false) checkedTexts.set(field, text)
    }

    const handleChange = () => {
      onTextChanged?.()
      cancelProcessing()
      clearTimeout(timer)
      timer = isComposing ? null : setTimeout(processText, getDelayMs())
    }

    // Text being composed with an input method (Hindi, Chinese, …) is unfinished, so it waits for the composition to end.
    const handleCompositionStart = () => {
      isComposing = true
      handleChange()
    }

    const handleCompositionEnd = () => {
      isComposing = false
      handleChange()
    }

    const options = { signal: listeners.signal }
    field.addEventListener('input', handleChange, options)
    // Sites that insert pasted text themselves fire no input event for it.
    field.addEventListener('paste', handleChange, options)
    field.addEventListener('compositionstart', handleCompositionStart, options)
    field.addEventListener('compositionend', handleCompositionEnd, options)
    // Rich-text editors also change their content without input events, for example clearing it after a message is sent.
    const mutationObserver = kind === FIELD_KINDS.contentEditable ? new MutationObserver(handleChange) : null
    mutationObserver?.observe(field, { childList: true, characterData: true, subtree: true })

    stopWatching = () => {
      listeners.abort()
      mutationObserver?.disconnect()
      clearTimeout(timer)
      cancelProcessing()
    }

    requestCheck = handleChange
    // Text already in the field when it gains focus, such as a draft, is checked too.
    handleChange()
  }

  return { watch, unwatch, recheck }
}
