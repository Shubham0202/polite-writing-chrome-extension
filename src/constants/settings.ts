import { REWRITE_STYLES, type RewriteStyle } from './ai.ts'

export const DELAY_LIMITS_MS = Object.freeze({ min: 500, max: 3000, step: 250 })

export const THEMES = Object.freeze({
  system: 'system',
  light: 'light',
  dark: 'dark',
})

export type Theme = (typeof THEMES)[keyof typeof THEMES]

export const THEME_LABEL: Record<Theme, string> = {
  [THEMES.system]: 'Match system',
  [THEMES.light]: 'Light',
  [THEMES.dark]: 'Dark',
}

export interface Settings {
  isInlineEnabled: boolean
  isSpellingEnabled: boolean
  isGrammarEnabled: boolean
  isPoliteEnabled: boolean
  isProfessionalEnabled: boolean
  delayMs: number
  isAiShortcutEnabled: boolean
  aiShortcutStyle: RewriteStyle
  isCloseOnAcceptEnabled: boolean
  theme: Theme
  pausedSites: string[]
  customSites: string[]
  isLocalLanguageToolEnabled: boolean
}

// A LanguageTool server the user runs on this computer. Its permission is optional and asked for only when the user
// turns the server on in Settings, since whatever program listens at this address receives the text.
export const LOCAL_LANGUAGE_TOOL = Object.freeze({
  serverUrl: 'http://localhost:8081',
  permissionPattern: 'http://localhost:8081/*',
})

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  isInlineEnabled: true,
  isSpellingEnabled: true,
  isGrammarEnabled: true,
  isPoliteEnabled: true,
  isProfessionalEnabled: true,
  delayMs: 1000,
  // Ctrl+Shift+Space also asks the AI provider for a rewrite, in this style. Off by default: each press is a request.
  isAiShortcutEnabled: false,
  aiShortcutStyle: REWRITE_STYLES.improveWording,
  // Accepting the AI's rewrite always closes the Ctrl+Shift+Space list; with this on, accepting anything does.
  isCloseOnAcceptEnabled: false,
  theme: THEMES.system,
  pausedSites: [],
  customSites: [],
  isLocalLanguageToolEnabled: false,
})

export const BUILT_IN_SITES = Object.freeze([
  { label: 'Gmail', hostname: 'mail.google.com' },
  { label: 'Google Chat', hostname: 'chat.google.com' },
  { label: 'WhatsApp Web', hostname: 'web.whatsapp.com' },
  { label: 'LinkedIn', hostname: 'www.linkedin.com' },
  { label: 'Jira', hostname: '*.atlassian.net' },
])
