import { AI_PROVIDERS, AI_PROVIDER_DEFAULT_MODEL, DEFAULT_AI_SETTINGS, type AiProvider, type AiSettings } from '../constants/ai.ts'
import { onStorageValueChanged } from './storageChanges.ts'

// Kept apart from the other settings on purpose: the content script reads those, and it must never hold the API key.
const STORAGE_KEY = 'aiSettings'

// Keys copied from docs or a chat often arrive wrapped in quotes or carrying invisible characters; neither is part
// of the key, and a header with such characters would make the request fail before it is sent.
const INVISIBLE_PATTERN = /[\u200B-\u200D\uFEFF\u00A0]/g
const WRAPPING_QUOTES_PATTERN = /^["'`“”‘’]+|["'`“”‘’]+$/g

const toTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.replace(INVISIBLE_PATTERN, '').trim().replace(WRAPPING_QUOTES_PATTERN, '').trim() : ''

// Stored values are data. A provider this version does not know (chosen in a newer version, or retired since) takes
// its key and model with it: they were issued for that provider and must never be sent anywhere else.
export interface StoredAiSettings {
  provider?: unknown
  apiKey?: unknown
  model?: unknown
}

export const normalizeAiSettings = (stored?: StoredAiSettings): AiSettings =>
  Object.values<unknown>(AI_PROVIDERS).includes(stored?.provider)
    ? { provider: stored!.provider as AiProvider, apiKey: toTrimmedString(stored!.apiKey), model: toTrimmedString(stored!.model) }
    : { ...DEFAULT_AI_SETTINGS }

export const getAiSettings = async (): Promise<AiSettings> =>
  normalizeAiSettings((await chrome.storage.local.get<Record<string, StoredAiSettings | undefined>>(STORAGE_KEY))[STORAGE_KEY])

export const updateAiSettings = async (changes: Partial<AiSettings>): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeAiSettings({ ...(await getAiSettings()), ...changes }) })
}

export const onAiSettingsChanged = (listener: (settings: AiSettings) => void): (() => void) =>
  onStorageValueChanged(STORAGE_KEY, (newValue: StoredAiSettings | undefined) => listener(normalizeAiSettings(newValue)))

export const isAiConfigured = ({ apiKey }: Pick<AiSettings, 'apiKey'>): boolean => apiKey.length > 0

// An empty model means "the provider's current default", so it follows upgrades without the user doing anything.
export const resolveModel = ({ provider, model }: Pick<AiSettings, 'provider' | 'model'>): string => model || AI_PROVIDER_DEFAULT_MODEL[provider]

// Keys are ASCII tokens; anything else usually means a paste went wrong, and a header with other characters makes
// fetch fail before any request is sent.
const API_KEY_PATTERN = /^[\x21-\x7E]+$/

export const getApiKeyValidationError = (apiKey: unknown): string | null => {
  const key = toTrimmedString(apiKey)
  if (!key) return 'Enter an API key.'
  if (!API_KEY_PATTERN.test(key)) return 'The API key can only contain letters, numbers and punctuation, without spaces.'
  return null
}

export const getModelValidationError = (model: unknown): string | null => (/\s/.test(toTrimmedString(model)) ? 'The model name cannot contain spaces.' : null)
