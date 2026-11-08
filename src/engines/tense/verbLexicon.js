// Only verbs listed here are ever corrected: a small, known vocabulary keeps tense rules precise.
export const VERB_FORMS = Object.freeze({
  base: 'base',
  third: 'third',
  past: 'past',
  participle: 'participle',
  ing: 'ing',
})

// [base, past, past participle, third person (only when irregular)]
const IRREGULAR_VERBS = [
  ['become', 'became', 'become'],
  ['begin', 'began', 'begun'],
  ['break', 'broke', 'broken'],
  ['bring', 'brought', 'brought'],
  ['build', 'built', 'built'],
  ['buy', 'bought', 'bought'],
  ['catch', 'caught', 'caught'],
  ['choose', 'chose', 'chosen'],
  ['come', 'came', 'come'],
  ['cost', 'cost', 'cost'],
  ['cut', 'cut', 'cut'],
  ['do', 'did', 'done', 'does'],
  ['draw', 'drew', 'drawn'],
  ['drink', 'drank', 'drunk'],
  ['drive', 'drove', 'driven'],
  ['eat', 'ate', 'eaten'],
  ['fall', 'fell', 'fallen'],
  ['feel', 'felt', 'felt'],
  ['find', 'found', 'found'],
  ['fly', 'flew', 'flown'],
  ['forget', 'forgot', 'forgotten'],
  ['forgive', 'forgave', 'forgiven'],
  ['get', 'got', 'gotten'],
  ['give', 'gave', 'given'],
  ['go', 'went', 'gone'],
  ['grow', 'grew', 'grown'],
  ['have', 'had', 'had', 'has'],
  ['hear', 'heard', 'heard'],
  ['hide', 'hid', 'hidden'],
  ['hold', 'held', 'held'],
  ['hurt', 'hurt', 'hurt'],
  ['keep', 'kept', 'kept'],
  ['know', 'knew', 'known'],
  ['leave', 'left', 'left'],
  ['lend', 'lent', 'lent'],
  ['let', 'let', 'let'],
  ['lose', 'lost', 'lost'],
  ['make', 'made', 'made'],
  ['mean', 'meant', 'meant'],
  ['meet', 'met', 'met'],
  ['pay', 'paid', 'paid'],
  ['put', 'put', 'put'],
  ['read', 'read', 'read'],
  ['ride', 'rode', 'ridden'],
  ['run', 'ran', 'run'],
  ['say', 'said', 'said'],
  ['see', 'saw', 'seen'],
  ['sell', 'sold', 'sold'],
  ['send', 'sent', 'sent'],
  ['set', 'set', 'set'],
  ['shake', 'shook', 'shaken'],
  ['show', 'showed', 'shown'],
  ['shut', 'shut', 'shut'],
  ['sing', 'sang', 'sung'],
  ['sit', 'sat', 'sat'],
  ['sleep', 'slept', 'slept'],
  ['speak', 'spoke', 'spoken'],
  ['spend', 'spent', 'spent'],
  ['stand', 'stood', 'stood'],
  ['steal', 'stole', 'stolen'],
  ['swim', 'swam', 'swum'],
  ['take', 'took', 'taken'],
  ['teach', 'taught', 'taught'],
  ['tell', 'told', 'told'],
  ['think', 'thought', 'thought'],
  ['throw', 'threw', 'thrown'],
  ['understand', 'understood', 'understood'],
  ['wake', 'woke', 'woken'],
  ['wear', 'wore', 'worn'],
  ['win', 'won', 'won'],
  ['write', 'wrote', 'written'],
]

const REGULAR_VERBS = [
  'accept', 'add', 'agree', 'allow', 'answer', 'apply', 'approve', 'arrive', 'ask', 'assign', 'attend',
  'believe', 'belong', 'book', 'call', 'carry', 'change', 'check', 'clean', 'close', 'complete', 'confirm',
  'contact', 'cook', 'create', 'cry', 'decide', 'delete', 'deliver', 'deploy', 'deserve', 'design', 'develop',
  'disagree', 'discuss', 'doubt', 'download', 'email', 'enjoy', 'explain', 'finish', 'fix', 'follow', 'happen',
  'hate', 'help', 'hope', 'improve', 'inform', 'install', 'investigate', 'join', 'learn', 'like', 'listen',
  'live', 'look', 'love', 'manage', 'mention', 'miss', 'move', 'need', 'notice', 'offer', 'open', 'order',
  'own', 'pass', 'plan', 'play', 'prefer', 'prepare', 'print', 'provide', 'push', 'raise', 'reach', 'realize',
  'receive', 'recognize', 'release', 'remember', 'remind', 'remove', 'reply', 'report', 'request', 'resolve',
  'return', 'review', 'schedule', 'seem', 'share', 'sign', 'solve', 'start', 'stay', 'stop', 'study', 'submit',
  'support', 'suppose', 'talk', 'test', 'travel', 'trust', 'try', 'update', 'upload', 'use', 'verify', 'visit',
  'wait', 'walk', 'want', 'watch', 'wish', 'work', 'worry',
]

// Final consonant doubles before -ed / -ing (stop → stopped, stopping).
const DOUBLED_FINAL_CONSONANT = new Set([
  'admit', 'begin', 'chat', 'commit', 'cut', 'drop', 'forget', 'get', 'let', 'plan', 'prefer', 'put', 'run',
  'set', 'ship', 'shop', 'shut', 'sit', 'skip', 'stop', 'submit', 'swim', 'win',
])

// Auxiliaries carry tense for other verbs, so time-based rules do not rewrite them.
const AUXILIARY_VERBS = new Set(['do', 'have'])

const toThirdPerson = (base) => {
  if (/(?:s|x|z|ch|sh|o)$/.test(base)) return `${base}es`
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`
  return `${base}s`
}

const toRegularPast = (base) => {
  if (base.endsWith('e')) return `${base}d`
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`
  if (DOUBLED_FINAL_CONSONANT.has(base)) return `${base}${base.at(-1)}ed`
  return `${base}ed`
}

const toIng = (base) => {
  if (/[^eoy]e$/.test(base)) return `${base.slice(0, -1)}ing`
  if (DOUBLED_FINAL_CONSONANT.has(base)) return `${base}${base.at(-1)}ing`
  return `${base}ing`
}

const createVerb = ([base, past, participle, third = toThirdPerson(base)]) => ({
  base,
  third,
  past,
  participle,
  ing: toIng(base),
  isAuxiliary: AUXILIARY_VERBS.has(base),
})

const VERBS = [
  ...IRREGULAR_VERBS.map(createVerb),
  ...REGULAR_VERBS.map((base) => createVerb([base, toRegularPast(base), toRegularPast(base)])),
]

const FORM_INDEX = VERBS.reduce((index, verb) => {
  for (const form of Object.values(VERB_FORMS)) {
    const word = verb[form]
    index.set(word, [...(index.get(word) ?? []), { verb, form }])
  }
  return index
}, new Map())

/**
 * Finds a verb whose `forms` include `word`. Returns null when `word` is also one of `excludeForms`
 * of any verb, because such words are ambiguous ("read" is both present and past).
 */
export const findVerbByForm = (word, forms, { excludeForms = [] } = {}) => {
  const entries = FORM_INDEX.get(word) ?? []
  if (entries.some((entry) => excludeForms.includes(entry.form))) return null
  return entries.find((entry) => forms.includes(entry.form)) ?? null
}
