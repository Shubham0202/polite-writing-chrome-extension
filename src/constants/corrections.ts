export const MAX_TEXT_LENGTH = 5000

// nspell's suggestion search slows down sharply for long unknown words, so longer words are never checked.
export const MAX_CHECKED_WORD_LENGTH = 20

export const CORRECTION_ACTIONS = Object.freeze({
  fixGrammar: 'fix-grammar',
  makePolite: 'make-polite',
  professional: 'professional',
  fixEverything: 'fix-everything',
  inlineCheck: 'inline-check',
})

export type CorrectionAction = (typeof CORRECTION_ACTIONS)[keyof typeof CORRECTION_ACTIONS]

// Handled by the writing enhancer, never by the correction pipeline, which keeps rejecting it as unavailable.
export const REWRITE_ACTION = 'ai-rewrite'

export const ACTION_LABEL: Record<CorrectionAction | typeof REWRITE_ACTION, string> = {
  [CORRECTION_ACTIONS.fixGrammar]: 'Fix Grammar',
  [CORRECTION_ACTIONS.makePolite]: 'Make Polite',
  [CORRECTION_ACTIONS.professional]: 'Professional',
  [CORRECTION_ACTIONS.fixEverything]: 'Fix Everything',
  [CORRECTION_ACTIONS.inlineCheck]: 'Inline check',
  [REWRITE_ACTION]: 'AI rewrite',
}

export const TONES = Object.freeze({
  polite: 'polite',
  professional: 'professional',
})

export type Tone = (typeof TONES)[keyof typeof TONES]

export const TONE_LABEL: Record<Tone, string> = {
  [TONES.polite]: 'Polite',
  [TONES.professional]: 'Professional',
}

export const ENGINES = Object.freeze({
  spelling: 'spelling',
  grammar: 'grammar',
  tense: 'tense',
  tone: 'tone',
  rewrite: 'rewrite',
})

export type Engine = (typeof ENGINES)[keyof typeof ENGINES]

export const SOURCES = Object.freeze({
  dictionary: 'dictionary',
  languageTool: 'languagetool',
  localRule: 'local-rule',
  ai: 'ai',
})

export type Source = (typeof SOURCES)[keyof typeof SOURCES]

export const SOURCE_LABEL: Record<Source, string> = {
  [SOURCES.dictionary]: 'Dictionary',
  [SOURCES.languageTool]: 'LanguageTool',
  [SOURCES.localRule]: 'Local rule',
  [SOURCES.ai]: 'AI',
}

export const CATEGORIES = Object.freeze({
  spelling: 'spelling',
  grammar: 'grammar',
  punctuation: 'punctuation',
  capitalization: 'capitalization',
  tense: 'tense',
  style: 'style',
  tone: 'tone',
  wording: 'wording',
})

export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES]

export const CATEGORY_LABEL: Record<Category, string> = {
  [CATEGORIES.spelling]: 'Spelling',
  [CATEGORIES.grammar]: 'Grammar',
  [CATEGORIES.punctuation]: 'Punctuation',
  [CATEGORIES.capitalization]: 'Capitalization',
  [CATEGORIES.tense]: 'Tense',
  [CATEGORIES.style]: 'Style',
  [CATEGORIES.tone]: 'Tone',
  [CATEGORIES.wording]: 'Wording',
}

export const CONFIDENCE = Object.freeze({
  high: 'high',
  low: 'low',
})

export type Confidence = (typeof CONFIDENCE)[keyof typeof CONFIDENCE]

export const ENGINE_STATUS = Object.freeze({
  used: 'used',
  unavailable: 'unavailable',
  failed: 'failed',
})

export type EngineStatus = (typeof ENGINE_STATUS)[keyof typeof ENGINE_STATUS]
