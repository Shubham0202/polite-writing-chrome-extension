export const AI_PROVIDERS = Object.freeze({
  gemini: 'gemini',
  groq: 'groq',
  openRouter: 'openrouter',
})

export type AiProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS]

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  [AI_PROVIDERS.gemini]: 'Google Gemini',
  [AI_PROVIDERS.groq]: 'Groq',
  [AI_PROVIDERS.openRouter]: 'OpenRouter',
}

// Used while the model field in Settings is empty. Checked against each provider's own model list on 2026-11-08:
// Gemini 2.5 is closed to new API keys, and Groq's Llama models are enterprise-only. The newest Gemini Flash
// (gemini-3.8-flash) answered with 503 "high demand" that day, so the stable previous generation is the default.
// OpenRouter defaults to a free model at the user's request; OpenRouter only serves free models to accounts whose
// privacy settings allow them, and caps how often they can be called.
export const AI_PROVIDER_DEFAULT_MODEL: Record<AiProvider, string> = {
  [AI_PROVIDERS.gemini]: 'gemini-3.6-flash',
  [AI_PROVIDERS.groq]: 'openai/gpt-oss-120b',
  [AI_PROVIDERS.openRouter]: 'liquid/lfm-3-1.7b:free',
}

// Offered under the model field in Settings. For OpenRouter: the free models that write text and support JSON output,
// from its model list on 2026-11-08. Free models come and go, so the field still takes any model name.
export const AI_PROVIDER_SUGGESTED_MODELS: Record<AiProvider, readonly string[]> = {
  [AI_PROVIDERS.gemini]: [],
  [AI_PROVIDERS.groq]: [],
  [AI_PROVIDERS.openRouter]: [
    AI_PROVIDER_DEFAULT_MODEL[AI_PROVIDERS.openRouter],
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'xingchen-agi/xing4.0-29b-a4b:free',
    'dots-studio/dots-3-note-preview:free',
    'recursive/flint-v1.0:free',
    'liquid/lfm-2.5-2.6b:free',
  ],
}

// Where each provider's API lives. All three answer cross-origin requests from the extension (checked 2026-11-08),
// so, like the online LanguageTool service, they need no host permission.
export const AI_PROVIDER_ORIGIN: Record<AiProvider, string> = {
  [AI_PROVIDERS.gemini]: 'https://generativelanguage.googleapis.com',
  [AI_PROVIDERS.groq]: 'https://api.groq.com',
  [AI_PROVIDERS.openRouter]: 'https://openrouter.ai',
}

export const AI_PROVIDER_KEY_URL: Record<AiProvider, string> = {
  [AI_PROVIDERS.gemini]: 'https://aistudio.google.com/apikey',
  [AI_PROVIDERS.groq]: 'https://console.groq.com/keys',
  [AI_PROVIDERS.openRouter]: 'https://openrouter.ai/workspaces/default/keys',
}

export const REWRITE_STYLES = Object.freeze({
  improveWording: 'improve-wording',
  professional: 'professional',
  polite: 'polite',
  concise: 'concise',
  friendly: 'friendly',
  clarity: 'clarity',
})

export type RewriteStyle = (typeof REWRITE_STYLES)[keyof typeof REWRITE_STYLES]

export const REWRITE_STYLE_LABEL: Record<RewriteStyle, string> = {
  [REWRITE_STYLES.improveWording]: 'Improve wording',
  [REWRITE_STYLES.professional]: 'Make professional',
  [REWRITE_STYLES.polite]: 'Make polite',
  [REWRITE_STYLES.concise]: 'Make concise',
  [REWRITE_STYLES.friendly]: 'Make friendly',
  [REWRITE_STYLES.clarity]: 'Improve clarity',
}

export interface AiSettings {
  provider: AiProvider
  apiKey: string
  model: string
}

export const DEFAULT_AI_SETTINGS: Readonly<AiSettings> = Object.freeze({
  provider: AI_PROVIDERS.gemini,
  apiKey: '',
  model: '',
})
