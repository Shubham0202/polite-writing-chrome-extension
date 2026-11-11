import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AI_PROVIDERS, AI_PROVIDER_DEFAULT_MODEL, AI_PROVIDER_KEY_URL, AI_PROVIDER_ORIGIN, AI_PROVIDER_SUGGESTED_MODELS, API_KEY_SLOTS, DEFAULT_AI_SETTINGS, type AiSettings } from '../constants/ai.ts'
import {
  getActiveKeySlot,
  getAiSettings,
  getApiKeyValidationError,
  getBackupApiKeyValidationError,
  getModelValidationError,
  getProviderSwitchFields,
  isAiConfigured,
  normalizeAiSettings,
  onAiSettingsChanged,
  orderApiKeys,
  resolveModel,
  setActiveKeySlot,
  updateAiSettings,
} from './aiSettings.ts'

type StorageChangeListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void

describe('AI settings', () => {
  describe('storage', () => {
    let stored: Record<string, unknown>
    let listeners: StorageChangeListener[]

    beforeEach(() => {
      stored = {}
      listeners = []
      globalThis.chrome = {
        storage: {
          local: {
            get: async (key: string) => (key in stored ? { [key]: stored[key] } : {}),
            set: async (values: Record<string, unknown>) => Object.assign(stored, values),
          },
          onChanged: {
            addListener: (listener: StorageChangeListener) => listeners.push(listener),
            removeListener: (listener: StorageChangeListener) => listeners.splice(listeners.indexOf(listener), 1),
          },
        },
      } as unknown as typeof chrome
    })

    afterEach(() => {
      delete (globalThis as { chrome?: typeof chrome }).chrome
    })

    it('starts with Gemini selected and no key', async () => {
      assert.deepEqual(await getAiSettings(), DEFAULT_AI_SETTINGS)
      assert.equal(isAiConfigured(await getAiSettings()), false)
    })

    it('keeps other values when one changes, and cleans what the user pasted', async () => {
      await updateAiSettings({ apiKey: '  "\u200Bsecret-key\uFEFF" \n' })
      await updateAiSettings({ provider: AI_PROVIDERS.groq })
      const settings = await getAiSettings()
      assert.deepEqual(settings, { ...DEFAULT_AI_SETTINGS, provider: AI_PROVIDERS.groq, apiKey: 'secret-key' })
      assert.equal(isAiConfigured(settings), true)
    })

    it('never stores the key under the general settings key the content script reads', async () => {
      await updateAiSettings({ apiKey: 'secret-key' })
      assert.equal('settings' in stored, false)
      assert.equal((stored.aiSettings as AiSettings).apiKey, 'secret-key')
    })

    it('keeps the active key in its own entry, so remembering it never rewrites the saved keys', async () => {
      assert.equal(await getActiveKeySlot(), API_KEY_SLOTS.primary)
      await updateAiSettings({ apiKey: 'sk-first', backupApiKey: 'sk-second' })
      const savedKeys = stored.aiSettings
      await setActiveKeySlot(API_KEY_SLOTS.backup)
      assert.equal(stored.aiSettings, savedKeys)
      assert.equal(await getActiveKeySlot(), API_KEY_SLOTS.backup)
    })

    it('starts again from the first key on every save from Settings, in the same write as the keys', async () => {
      await setActiveKeySlot(API_KEY_SLOTS.backup)
      const writes: Array<Record<string, unknown>> = []
      const set = chrome.storage.local.set
      chrome.storage.local.set = (async (values: Record<string, unknown>) => {
        writes.push(values)
        return set(values)
      }) as typeof chrome.storage.local.set
      await updateAiSettings({ model: 'some-model' })
      assert.deepEqual(Object.keys(writes[0]).sort(), ['aiActiveKeySlot', 'aiSettings'])
      assert.equal(await getActiveKeySlot(), API_KEY_SLOTS.primary)
    })

    it('reads a missing or unknown active key as the first key', async () => {
      for (const value of [undefined, 'constructor', 42]) {
        stored.aiActiveKeySlot = value
        assert.equal(await getActiveKeySlot(), API_KEY_SLOTS.primary, String(value))
      }
    })

    it('does not tell Settings about a change of the active key', () => {
      const calls: AiSettings[] = []
      onAiSettingsChanged((settings) => calls.push(settings))
      listeners.forEach((listener) => listener({ aiActiveKeySlot: { newValue: API_KEY_SLOTS.backup } }, 'local'))
      assert.deepEqual(calls, [])
    })

    it('reports changes with normalized values, and stops when asked', () => {
      const calls: AiSettings[] = []
      const stop = onAiSettingsChanged((settings) => calls.push(settings))
      const fire = () => listeners.forEach((listener) => listener({ aiSettings: { newValue: { provider: 'nope', apiKey: ' k ' } } }, 'local'))

      listeners[0]({ settings: { newValue: { delayMs: 1 } } }, 'local')
      fire()
      stop()
      fire()
      assert.deepEqual(calls, [DEFAULT_AI_SETTINGS])
    })
  })

  describe('validation', () => {
    it('accepts real-looking keys and model names', () => {
      for (const key of ['AIzaSyA-1234_abcDEF', 'gsk_abc123', 'sk-or-v1-0123456789abcdef', '  sk-test \n', '"AIzaSyA-1234"', '\u200Bgsk_abc\u00A0']) assert.equal(getApiKeyValidationError(key), null, key)
      for (const model of ['', 'gemini-3.8-flash', 'openai/gpt-4.1-mini:free', ' openai/gpt-oss-120b ']) assert.equal(getModelValidationError(model), null, model)
    })

    it('suggests only valid, distinct model names, with the default among them for every provider that has suggestions', () => {
      for (const provider of Object.values(AI_PROVIDERS)) {
        const suggestions = AI_PROVIDER_SUGGESTED_MODELS[provider]
        assert.ok(Array.isArray(suggestions), provider)
        assert.equal(new Set(suggestions).size, suggestions.length, provider)
        for (const model of suggestions) assert.equal(getModelValidationError(model), null, model)
        if (suggestions.length) assert.ok(suggestions.includes(AI_PROVIDER_DEFAULT_MODEL[provider]), provider)
      }
      assert.ok(AI_PROVIDER_SUGGESTED_MODELS[AI_PROVIDERS.openRouter].length > 1)
    })

    it('refuses empty keys, keys with spaces or non-ASCII characters, and models with spaces', () => {
      assert.match(getApiKeyValidationError('')!, /Enter an API key/)
      assert.match(getApiKeyValidationError('   ')!, /Enter an API key/)
      assert.match(getApiKeyValidationError(42)!, /Enter an API key/)
      for (const key of ['sk test', 'sk‑test', 'clé']) assert.match(String(getApiKeyValidationError(key)), /letters, numbers and punctuation/, String(key))
      assert.match(getModelValidationError('gemini 3.8 flash')!, /cannot contain spaces/)
    })

    it('lets the backup key stay empty, but refuses a copy of the first key or a broken one', () => {
      for (const key of ['', '   ', undefined]) assert.equal(getBackupApiKeyValidationError(key, 'sk-first'), null, String(key))
      assert.equal(getBackupApiKeyValidationError('sk-second', 'sk-first'), null)
      assert.match(getBackupApiKeyValidationError(' "sk-first" ', 'sk-first')!, /same as the API key/)
      assert.match(getBackupApiKeyValidationError('sk second', 'sk-first')!, /letters, numbers and punctuation/)
    })
  })

  describe('providers', () => {
    it('has a bare https origin, a default model and a key page for every provider', () => {
      for (const provider of Object.values(AI_PROVIDERS)) {
        const origin = AI_PROVIDER_ORIGIN[provider]
        assert.equal(new URL(origin).origin, origin, provider)
        assert.ok(origin.startsWith('https://'), provider)
        assert.ok(AI_PROVIDER_DEFAULT_MODEL[provider].length > 0, provider)
        assert.equal(new URL(AI_PROVIDER_KEY_URL[provider]).protocol, 'https:', provider)
      }
    })
  })

  describe('normalization', () => {
    it('falls back to the defaults, key included, for an unknown provider', () => {
      assert.deepEqual(normalizeAiSettings({ provider: 'constructor', apiKey: 'sk-other-vendor', model: 'x' }), DEFAULT_AI_SETTINGS)
      assert.equal(normalizeAiSettings({ provider: 'constructor' }).provider, AI_PROVIDERS.gemini)
      assert.equal(normalizeAiSettings(undefined).provider, AI_PROVIDERS.gemini)
      assert.equal(normalizeAiSettings({ apiKey: 42, model: null }).apiKey, '')
    })

    it('reads settings saved before the backup key existed, and cleans the backup key', () => {
      assert.deepEqual(normalizeAiSettings({ provider: AI_PROVIDERS.groq, apiKey: 'gsk' }), { ...DEFAULT_AI_SETTINGS, provider: AI_PROVIDERS.groq, apiKey: 'gsk' })
      assert.equal(normalizeAiSettings({ provider: AI_PROVIDERS.groq, apiKey: 'gsk', backupApiKey: ' "gsk-2" ' }).backupApiKey, 'gsk-2')
      assert.equal(normalizeAiSettings({ provider: AI_PROVIDERS.groq, backupApiKey: 42 }).backupApiKey, '')
    })

    it('empties the keys and the model for another provider, and brings the saved keys back for the saved one', () => {
      const saved: AiSettings = { provider: AI_PROVIDERS.gemini, apiKey: 'AIza-first', backupApiKey: 'AIza-second', model: 'gemini-3.5-flash-lite' }
      assert.deepEqual(getProviderSwitchFields(AI_PROVIDERS.groq, saved), { provider: AI_PROVIDERS.groq, apiKey: '', backupApiKey: '', model: '' })
      assert.deepEqual(getProviderSwitchFields(AI_PROVIDERS.gemini, saved), { provider: AI_PROVIDERS.gemini, apiKey: 'AIza-first', backupApiKey: 'AIza-second', model: '' })
    })

    it('orders the keys active first, and leaves out an empty one', () => {
      const keys = { apiKey: 'sk-first', backupApiKey: 'sk-second' }
      assert.deepEqual(orderApiKeys(keys, API_KEY_SLOTS.primary), [
        { slot: API_KEY_SLOTS.primary, apiKey: 'sk-first' },
        { slot: API_KEY_SLOTS.backup, apiKey: 'sk-second' },
      ])
      assert.deepEqual(orderApiKeys(keys, API_KEY_SLOTS.backup), [
        { slot: API_KEY_SLOTS.backup, apiKey: 'sk-second' },
        { slot: API_KEY_SLOTS.primary, apiKey: 'sk-first' },
      ])
      assert.deepEqual(orderApiKeys({ ...keys, backupApiKey: '' }, API_KEY_SLOTS.backup), [{ slot: API_KEY_SLOTS.primary, apiKey: 'sk-first' }])
    })

    it('uses the provider default model only while the model field is empty', () => {
      for (const provider of Object.values(AI_PROVIDERS)) {
        assert.equal(resolveModel({ provider, model: '' }), AI_PROVIDER_DEFAULT_MODEL[provider], provider)
      }
      assert.equal(resolveModel({ provider: AI_PROVIDERS.gemini, model: 'gemini-3.5-flash-lite' }), 'gemini-3.5-flash-lite')
    })
  })
})
