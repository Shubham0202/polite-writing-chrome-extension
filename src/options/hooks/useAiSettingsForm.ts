import { useState } from 'react'
import type { AiSettings } from '../../constants/ai.ts'
import { getApiKeyValidationError, getModelValidationError, updateAiSettings } from '../../services/aiSettings.ts'

export const FORM_STATUS = Object.freeze({
  idle: 'idle',
  saved: 'saved',
  removed: 'removed',
})

export type FormStatus = (typeof FORM_STATUS)[keyof typeof FORM_STATUS]

export interface AiSettingsFormError {
  field: 'apiKey' | 'model' | null
  message: string
}

export interface AiSettingsFormState {
  form: AiSettings
  error: AiSettingsFormError | null
  status: FormStatus
  update: (changes: Partial<AiSettings>) => void
  save: () => Promise<boolean>
  remove: () => Promise<void>
}

// No Chrome permission is involved: every provider answers cross-origin requests from the extension, like the online
// LanguageTool service does, so saving is validation plus storage.
export const useAiSettingsForm = (stored: AiSettings): AiSettingsFormState => {
  const [form, setForm] = useState<AiSettings>({ provider: stored.provider, apiKey: stored.apiKey, model: stored.model })
  // The error names the field it is about, so the right input is marked invalid for assistive technology.
  const [error, setError] = useState<AiSettingsFormError | null>(null)
  const [status, setStatus] = useState<FormStatus>(FORM_STATUS.idle)

  const update = (changes: Partial<AiSettings>) => {
    setForm((current) => ({ ...current, ...changes }))
    setError(null)
    setStatus(FORM_STATUS.idle)
  }

  const refuse = (field: AiSettingsFormError['field'], message: string) => {
    setError({ field, message })
    setStatus(FORM_STATUS.idle)
    return false
  }

  // Storage can refuse a write (quota, a profile in trouble); the form says so instead of looking saved.
  const store = async (changes: Partial<AiSettings>, failureMessage: string) => {
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
