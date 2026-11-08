import { MAX_TEXT_LENGTH } from '../constants/corrections.js'

export const getTextValidationError = (text) => {
  if (typeof text !== 'string' || !text.trim()) return 'Enter some text to check.'
  if (text.length > MAX_TEXT_LENGTH) {
    return `Text is too long. Shorten it to ${MAX_TEXT_LENGTH.toLocaleString('en-US')} characters or fewer.`
  }
  return null
}
