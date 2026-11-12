import { AI_PROVIDERS, AI_PROVIDER_DEFAULT_MODEL, API_KEY_SLOTS, DEFAULT_AI_SETTINGS, type AiProvider, type AiSettings, type ApiKeySlot } from '../constants/ai.ts'
import { onStorageValueChanged } from './storageChanges.ts'

// Kept apart from the other settings on purpose: content scripts are sent those, and must never get the API key.
const STORAGE_KEY = 'aiSettings'
// Kept apart from the keys on purpose: the service worker changes it during a rewrite, and writing the whole settings
// entry there could undo keys saved in Settings at that same moment.
const ACTIVE_KEY_SLOT_STORAGE_KEY = 'aiActiveKeySlot'

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
  backupApiKey?: unknown
  model?: unknown
}

export const normalizeAiSettings = (stored?: StoredAiSettings): AiSettings =>
  Object.values<unknown>(AI_PROVIDERS).includes(stored?.provider)
    ? {
        provider: stored!.provider as AiProvider,
        apiKey: toTrimmedString(stored!.apiKey),
        backupApiKey: toTrimmedString(stored!.backupApiKey),
        model: toTrimmedString(stored!.model),
      }
    : { ...DEFAULT_AI_SETTINGS }

export const getAiSettings = async (): Promise<AiSettings> =>
  normalizeAiSettings((await chrome.storage.local.get<Record<string, StoredAiSettings | undefined>>(STORAGE_KEY))[STORAGE_KEY])

// Every save from Settings starts again from the first key, since the keys may just have been replaced. Both go in one
// write, so the reset never lands without the keys it belongs to.
export const updateAiSettings = async (changes: Partial<AiSettings>): Promise<void> => {
  await chrome.storage.local.set({
    [STORAGE_KEY]: normalizeAiSettings({ ...(await getAiSettings()), ...changes }),
    [ACTIVE_KEY_SLOT_STORAGE_KEY]: API_KEY_SLOTS.primary,
  })
}

const toApiKeySlot = (value: unknown): ApiKeySlot => (Object.values<unknown>(API_KEY_SLOTS).includes(value) ? (value as ApiKeySlot) : API_KEY_SLOTS.primary)

export const getActiveKeySlot = async (): Promise<ApiKeySlot> =>
  toApiKeySlot((await chrome.storage.local.get<Record<string, unknown>>(ACTIVE_KEY_SLOT_STORAGE_KEY))[ACTIVE_KEY_SLOT_STORAGE_KEY])

export const setActiveKeySlot = async (slot: ApiKeySlot): Promise<void> => {
  await chrome.storage.local.set({ [ACTIVE_KEY_SLOT_STORAGE_KEY]: slot })
}

export const onAiSettingsChanged = (listener: (settings: AiSettings) => void): (() => void) =>
  onStorageValueChanged(STORAGE_KEY, (newValue: StoredAiSettings | undefined) => listener(normalizeAiSettings(newValue)))

export const isAiConfigured = ({ apiKey }: Pick<AiSettings, 'apiKey'>): boolean => apiKey.length > 0

// Keys and model names are issued per provider, so another provider starts with empty fields and a key is never sent
// to a provider it was not made for. Going back to the saved provider brings its saved keys back.
export const getProviderSwitchFields = (provider: AiProvider, saved: AiSettings): AiSettings => {
  const isSavedProvider = provider === saved.provider
  return { provider, model: '', apiKey: isSavedProvider ? saved.apiKey : '', backupApiKey: isSavedProvider ? saved.backupApiKey : '' }
}

// An empty model means "the provider's current default", so it follows upgrades without the user doing anything.
export const resolveModel = ({ provider, model }: Pick<AiSettings, 'provider' | 'model'>): string => model || AI_PROVIDER_DEFAULT_MODEL[provider]

const API_KEY_FIELD: Record<ApiKeySlot, 'apiKey' | 'backupApiKey'> = {
  [API_KEY_SLOTS.primary]: 'apiKey',
  [API_KEY_SLOTS.backup]: 'backupApiKey',
}

const OTHER_API_KEY_SLOT: Record<ApiKeySlot, ApiKeySlot> = {
  [API_KEY_SLOTS.primary]: API_KEY_SLOTS.backup,
  [API_KEY_SLOTS.backup]: API_KEY_SLOTS.primary,
}

export interface SlottedApiKey {
  slot: ApiKeySlot
  apiKey: string
}

// The active key first, then the other one. A slot whose key was removed is left out, so a removed backup key never
// keeps the rewrite from using the key that is left.
export const orderApiKeys = (settings: Pick<AiSettings, 'apiKey' | 'backupApiKey'>, activeKeySlot: ApiKeySlot): SlottedApiKey[] =>
  [activeKeySlot, OTHER_API_KEY_SLOT[activeKeySlot]]
    .map((slot) => ({ slot, apiKey: settings[API_KEY_FIELD[slot]] }))
    .filter(({ apiKey }) => apiKey.length > 0)

// Keys are ASCII tokens; anything else usually means a paste went wrong, and a header with other characters makes
// fetch fail before any request is sent.
const API_KEY_PATTERN = /^[\x21-\x7E]+$/

export const getApiKeyValidationError = (apiKey: unknown): string | null => {
  const key = toTrimmedString(apiKey)
  if (!key) return 'Enter an API key.'
  if (!API_KEY_PATTERN.test(key)) return 'The API key can only contain letters, numbers and punctuation, without spaces.'
  return null
}

// The backup key is optional, and only helps when it is a different key: the same key shares the same limit.
export const getBackupApiKeyValidationError = (backupApiKey: unknown, apiKey: unknown): string | null => {
  const key = toTrimmedString(backupApiKey)
  if (!key) return null
  if (key === toTrimmedString(apiKey)) return 'The backup API key is the same as the API key. Enter a different key, or leave it empty.'
  return getApiKeyValidationError(key)
}

export const getModelValidationError = (model: unknown): string | null => (/\s/.test(toTrimmedString(model)) ? 'The model name cannot contain spaces.' : null)
