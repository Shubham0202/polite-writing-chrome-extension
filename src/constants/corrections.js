export const MAX_TEXT_LENGTH = 5000

export const CORRECTION_ACTIONS = Object.freeze({
  fixGrammar: 'fix-grammar',
  makePolite: 'make-polite',
  professional: 'professional',
  fixEverything: 'fix-everything',
  inlineCheck: 'inline-check',
})

// Handled by the writing enhancer, never by the correction pipeline, which keeps rejecting it as unavailable.
export const REWRITE_ACTION = 'ai-rewrite'

export const ACTION_LABEL = {
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

export const TONE_LABEL = {
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

export const SOURCES = Object.freeze({
  dictionary: 'dictionary',
  languageTool: 'languagetool',
  localRule: 'local-rule',
  ai: 'ai',
})

export const SOURCE_LABEL = {
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

export const CATEGORY_LABEL = {
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

export const ENGINE_STATUS = Object.freeze({
  used: 'used',
  unavailable: 'unavailable',
  failed: 'failed',
})
