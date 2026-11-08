import { REWRITE_STYLES } from './ai.js'

export const DELAY_LIMITS_MS = Object.freeze({ min: 500, max: 3000, step: 250 })

export const DEFAULT_SETTINGS = Object.freeze({
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
  pausedSites: [],
  customSites: [],
})

export const BUILT_IN_SITES = Object.freeze([
  { label: 'Gmail', hostname: 'mail.google.com' },
  { label: 'Google Chat', hostname: 'chat.google.com' },
  { label: 'WhatsApp Web', hostname: 'web.whatsapp.com' },
  { label: 'LinkedIn', hostname: 'www.linkedin.com' },
  { label: 'Jira', hostname: '*.atlassian.net' },
])
