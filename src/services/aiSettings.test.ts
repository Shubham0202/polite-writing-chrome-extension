import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AI_PROVIDERS, AI_PROVIDER_DEFAULT_MODEL, AI_PROVIDER_KEY_URL, AI_PROVIDER_ORIGIN, AI_PROVIDER_SUGGESTED_MODELS, DEFAULT_AI_SETTINGS, type AiSettings } from '../constants/ai.ts'
import {
  getAiSettings,
  getApiKeyValidationError,
  getModelValidationError,
  isAiConfigured,
  normalizeAiSettings,
  onAiSettingsChanged,
  resolveModel,
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
      assert.deepEqual(settings, { provider: AI_PROVIDERS.groq, apiKey: 'secret-key', model: '' })
      assert.equal(isAiConfigured(settings), true)
    })

    it('never stores the key under the general settings key the content script reads', async () => {
      await updateAiSettings({ apiKey: 'secret-key' })
      assert.equal('settings' in stored, false)
      assert.equal((stored.aiSettings as AiSettings).apiKey, 'secret-key')
    })

    it('reports changes with normalized values, and stops when asked', () => {
      const calls: AiSettings[] = []
      const stop = onAiSettingsChanged((settings) => calls.push(settings))
      const fire = () => listeners.forEach((listener) => listener({ aiSettings: { newValue: { provider: 'nope', apiKey: ' k ' } } }, 'local'))

      listeners[0]({ settings: { newValue: { delayMs: 1 } } }, 'local')
      fire()
      stop()
      fire()
      assert.deepEqual(calls, [{ provider: AI_PROVIDERS.gemini, apiKey: '', model: '' }])
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

    it('uses the provider default model only while the model field is empty', () => {
      for (const provider of Object.values(AI_PROVIDERS)) {
        assert.equal(resolveModel({ provider, model: '' }), AI_PROVIDER_DEFAULT_MODEL[provider], provider)
      }
      assert.equal(resolveModel({ provider: AI_PROVIDERS.gemini, model: 'gemini-3.5-flash-lite' }), 'gemini-3.5-flash-lite')
    })
  })
})
