import { useState } from 'react'
import { getApiKeyValidationError, getModelValidationError, updateAiSettings } from '../../services/aiSettings.js'

export const FORM_STATUS = Object.freeze({
  idle: 'idle',
  saved: 'saved',
  removed: 'removed',
})

// No Chrome permission is involved: every provider answers cross-origin requests from the extension, like the online
// LanguageTool service does, so saving is validation plus storage.
export const useAiSettingsForm = (stored) => {
  const [form, setForm] = useState({ provider: stored.provider, apiKey: stored.apiKey, model: stored.model })
  // The error names the field it is about, so the right input is marked invalid for assistive technology.
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(FORM_STATUS.idle)

  const update = (changes) => {
    setForm((current) => ({ ...current, ...changes }))
    setError(null)
    setStatus(FORM_STATUS.idle)
  }

  const refuse = (field, message) => {
    setError({ field, message })
    setStatus(FORM_STATUS.idle)
    return false
  }

  // Storage can refuse a write (quota, a profile in trouble); the form says so instead of looking saved.
  const store = async (changes, failureMessage) => {
    try {
      await updateAiSettings(changes)
      return true
    } catch {
      return refuse(null, failureMessage)
    }
  }

  const save = async () => {
    const keyError = getApiKeyValidationError(form.apiKey)
    if (keyError) return refuse('apiKey', keyError)
    const modelError = getModelValidationError(form.model)
    if (modelError) return refuse('model', modelError)
    if (!(await store(form, 'The settings could not be saved. Try again.'))) return false
    setError(null)
    setStatus(FORM_STATUS.saved)
    return true
  }

  // Only the key goes; a model the user typed is still right for the next key.
  const remove = async () => {
    if (!(await store({ apiKey: '' }, 'The key could not be removed. Try again.'))) return
    setForm((current) => ({ ...current, apiKey: '' }))
    setError(null)
    setStatus(FORM_STATUS.removed)
  }

  return { form, error, status, update, save, remove }
}
