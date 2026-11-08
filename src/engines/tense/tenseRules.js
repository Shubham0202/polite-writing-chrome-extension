/** @author Shubham Chandgude <shubham826852@gmail.com> */

import { CATEGORIES } from '../../constants/corrections.js'
import { lookup } from '../../utils/lookup.js'
import { matchCase } from '../../utils/textUtils.js'
import { VERB_FORMS, findVerbByForm } from './verbLexicon.js'

const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they'])
const THIRD_PERSON_PRONOUNS = new Set(['he', 'she', 'it'])
const OTHER_PRONOUNS = new Set(['i', 'you', 'we', 'they'])
const BE_SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'we', 'they'])
// "you" and "it" are also object pronouns ("send you updates"), so a verb before them blocks agreement rules.
const OBJECT_CAPABLE_PRONOUNS = new Set(['you', 'it'])

const DO_AUXILIARIES = new Set(['do', 'does', 'did', "don't", "doesn't", "didn't"])
const HAVE_AUXILIARIES = new Set(['have', 'has', 'had', "haven't", "hasn't", "hadn't", "i've", "you've", "we've", "they've"])
const PLAIN_HAVE_AUXILIARIES = new Set(['have', 'has', 'had'])
const MODALS = new Set([
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
  "can't", 'cannot', "couldn't", "shouldn't", "wouldn't", "won't", "mustn't",
])
// Demonstratives are left out: "that" before a pronoun is a conjunction ("so that it works").
const DETERMINERS = new Set(['the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their'])
// Words after which a pronoun is not followed by an agreeing verb: questions ("did she call", "is it open")
// and bare infinitives ("make it work", "let it go").
const BARE_VERB_TRIGGERS = new Set([
  ...DO_AUXILIARIES, ...MODALS, 'to', 'let', 'lets', "let's", 'make', 'makes', 'made', 'help', 'helps', 'helped',
  'see', 'sees', 'saw', 'seen', 'hear', 'hears', 'heard', 'watch', 'watches', 'watched', 'have', 'has', 'had',
  'am', 'is', 'are', 'was', 'were', "isn't", "aren't", "wasn't", "weren't",
])
const FREQUENCY_ADVERBS = new Set(['always', 'never', 'usually', 'often', 'sometimes', 'also', 'really', 'still', 'rarely', 'just', 'only', 'finally'])
const PERFECT_FILLERS = new Set(['not', 'just', 'already', 'never', 'ever', 'recently', 'also', 'finally', 'still', ...SUBJECT_PRONOUNS])

const STATIVE_VERBS = new Set([
  'agree', 'disagree', 'know', 'understand', 'need', 'want', 'love', 'hate', 'prefer', 'believe',
  'remember', 'own', 'belong', 'seem', 'deserve', 'recognize', 'realize', 'doubt',
])
// After "be" these are usually adjectives, prepositions or noun modifiers ("they are open", "he is like his father",
// "we are support engineers"), or are fixed by a grammar rule ("I am suppose to", "I am worry"), so no rule here.
const NO_VERB_RULE_AFTER_BE = new Set([
  'like', 'mean', 'suppose', 'use', 'worry', 'open', 'close', 'clean', 'complete', 'live',
  'test', 'support', 'review', 'report', 'plan', 'call', 'check', 'update', 'change', 'request', 'contact',
  'schedule', 'email', 'release', 'design', 'order', 'book', 'print', 'travel', 'return', 'offer', 'answer',
])

const CONTRACTED_SUBJECT_BE = {
  "i'm": { subject: 'I', be: 'am' },
  "you're": { subject: 'you', be: 'are' },
  "we're": { subject: 'we', be: 'are' },
  "they're": { subject: 'they', be: 'are' },
  "he's": { subject: 'he', be: 'is' },
  "she's": { subject: 'she', be: 'is' },
}

const toSimpleTense = {
  present: (verb, isNegated) => (isNegated ? `do not ${verb.base}` : verb.base),
  presentThird: (verb, isNegated) => (isNegated ? `does not ${verb.base}` : verb.third),
  past: (verb, isNegated) => (isNegated ? `did not ${verb.base}` : verb.past),
}

const SIMPLE_TENSE_FOR_BE = {
  am: toSimpleTense.present,
  are: toSimpleTense.present,
  is: toSimpleTense.presentThird,
  was: toSimpleTense.past,
  were: toSimpleTense.past,
}

const SAME_LINE_GAP_PATTERN = /^[^\S\n]+$/

const nextIndex = (context, index) => {
  const current = context.tokens[index]
  const next = context.tokens[index + 1]
  return next && SAME_LINE_GAP_PATTERN.test(context.text.slice(current.end, next.offset)) ? index + 1 : -1
}

const previousToken = (context, index) => {
  const previous = context.tokens[index - 1]
  return previous && SAME_LINE_GAP_PATTERN.test(context.text.slice(previous.end, context.tokens[index].offset)) ? previous : null
}

const skipWords = (context, index, words) =>
  index !== -1 && words.has(context.tokens[index].lower) ? skipWords(context, nextIndex(context, index), words) : index

// "IT" (information technology) is not the pronoun "it".
const isPronoun = (token, pronouns) => pronouns.has(token.lower) && (token.text.length === 1 || token.text !== token.text.toUpperCase())

const isSubjectBlocked = (context, index) => {
  const previous = previousToken(context, index)
  if (!previous) return false
  if (BARE_VERB_TRIGGERS.has(previous.lower) || DETERMINERS.has(previous.lower)) return true
  return OBJECT_CAPABLE_PRONOUNS.has(context.tokens[index].lower) && Boolean(findVerbByForm(previous.lower, Object.values(VERB_FORMS)))
}

const isModal = (token) => MODALS.has(token.lower) || token.lower.endsWith("'ll")

// Finds "pronoun + am/is/are/was/were (+ not) + verb" or "I'm (+ not) + verb" starting at `index`.
const findBePlusVerb = (context, index) => {
  const token = context.tokens[index]
  const contracted = lookup(CONTRACTED_SUBJECT_BE, token.lower)
  let from = index
  let be = contracted?.be
  let cursor = nextIndex(context, index)

  if (!contracted) {
    if (!isPronoun(token, BE_SUBJECT_PRONOUNS) || cursor === -1 || !lookup(SIMPLE_TENSE_FOR_BE, context.tokens[cursor].lower)) return null
    from = cursor
    be = context.tokens[cursor].lower
    cursor = nextIndex(context, cursor)
  }

  const isNegated = cursor !== -1 && context.tokens[cursor].lower === 'not'
  if (isNegated) cursor = nextIndex(context, cursor)
  if (cursor === -1) return null

  const match = findVerbByForm(context.tokens[cursor].lower, [VERB_FORMS.base], {
    excludeForms: [VERB_FORMS.past, VERB_FORMS.participle],
  })
  if (!match || NO_VERB_RULE_AFTER_BE.has(match.verb.base)) return null
  return { from, to: cursor, be, isNegated, verb: match.verb, subject: contracted ? matchCase(token.text, contracted.subject) : null }
}

export const TENSE_RULES = [
  {
    id: 'do-support-base-verb',
    category: CATEGORIES.tense,
    description: 'Use the base verb after do, does or did',
    examples: [
      { incorrect: 'I did went to the office.', correct: 'I did go to the office.' },
      { incorrect: "I didn't went to the office.", correct: "I didn't go to the office." },
      { incorrect: "She doesn't knows the answer.", correct: "She doesn't know the answer." },
      { incorrect: 'Did you saw the email?', correct: 'Did you see the email?' },
      { incorrect: 'He does not works here.', correct: 'He does not work here.' },
      { incorrect: "He doesn't has a laptop.", correct: "He doesn't have a laptop." },
    ],
    find: (context) =>
      context.tokens.flatMap((token, index) => {
        if (!DO_AUXILIARIES.has(token.lower)) return []
        let cursor = nextIndex(context, index)
        let isNegatedOrQuestion = token.lower.endsWith("n't")
        if (cursor !== -1 && context.tokens[cursor].lower === 'not') {
          isNegatedOrQuestion = true
          cursor = nextIndex(context, cursor)
        }
        if (cursor !== -1 && isPronoun(context.tokens[cursor], SUBJECT_PRONOUNS)) {
          isNegatedOrQuestion = true
          cursor = nextIndex(context, cursor)
        }
        if (cursor === -1) return []

        // Without "not" or a subject, "do tests" / "did reports" are usually do + noun, so only "did + past" is checked.
        const allowedForms = isNegatedOrQuestion ? [VERB_FORMS.past, VERB_FORMS.third] : token.lower === 'did' ? [VERB_FORMS.past] : []
        const match = findVerbByForm(context.tokens[cursor].lower, allowedForms, { excludeForms: [VERB_FORMS.base] })
        if (!match) return []
        return [{ from: cursor, to: cursor, replacements: [match.verb.base], explanation: `Use the base verb "${match.verb.base}" after "${token.text}".` }]
      }),
  },
  {
    id: 'modal-without-to',
    category: CATEGORIES.grammar,
    description: 'Modal verbs are followed directly by the base verb',
    examples: [
      { incorrect: 'I can to do it.', correct: 'I can do it.' },
      { incorrect: 'You should to call him.', correct: 'You should call him.' },
      { incorrect: 'We must to finish today.', correct: 'We must finish today.' },
    ],
    find: (context) =>
      context.tokens.flatMap((token, index) => {
        if (!isModal(token) || DETERMINERS.has(previousToken(context, index)?.lower)) return []
        const toIndex = nextIndex(context, index)
        if (toIndex === -1 || context.tokens[toIndex].lower !== 'to') return []
        const verbIndex = nextIndex(context, toIndex)
        if (verbIndex === -1 || !findVerbByForm(context.tokens[verbIndex].lower, [VERB_FORMS.base])) return []
        return [{ from: index, to: toIndex, replacements: [token.text], explanation: `Use the verb directly after "${token.lower}", without "to".` }]
      }),
  },
  {
    id: 'modal-base-verb',
    category: CATEGORIES.tense,
    description: 'Use the base verb after can, will, should and other modal verbs',
    examples: [
      { incorrect: 'He can speaks English.', correct: 'He can speak English.' },
      { incorrect: 'You should went home.', correct: 'You should go home.' },
      { incorrect: 'I will coming tomorrow.', correct: 'I will come tomorrow.' },
      { incorrect: 'She might called later.', correct: 'She might call later.' },
    ],
    find: (context) =>
      context.tokens.flatMap((token, index) => {
        // A sentence-initial "Will tested it" is the name Will, not a modal.
        if (index === 0 || !isModal(token) || DETERMINERS.has(previousToken(context, index)?.lower)) return []
        let cursor = nextIndex(context, index)
        if (cursor !== -1 && context.tokens[cursor].lower === 'not') cursor = nextIndex(context, cursor)
        if (cursor === -1) return []

        const match = findVerbByForm(
          context.tokens[cursor].lower,
          [VERB_FORMS.third, VERB_FORMS.past, VERB_FORMS.participle, VERB_FORMS.ing],
          { excludeForms: [VERB_FORMS.base] },
        )
        if (!match) return []
        const replacements = match.form === VERB_FORMS.ing ? [match.verb.base, `be ${match.verb.ing}`] : [match.verb.base]
        return [{ from: cursor, to: cursor, replacements, explanation: `Use the base verb "${match.verb.base}" after "${token.lower}".` }]
      }),
  },
  {
    id: 'stative-verb-without-be',
    category: CATEGORIES.tense,
    description: 'State verbs such as agree or know are not used with am/is/are',
    examples: [
      { incorrect: 'I am agree with you.', correct: 'I agree with you.' },
      { incorrect: 'She is not agree.', correct: 'She does not agree.' },
      { incorrect: "I'm agree.", correct: 'I agree.' },
      { incorrect: 'He is know the answer.', correct: 'He knows the answer.' },
    ],
    find: (context) =>
      context.tokens.flatMap((_, index) => {
        const found = findBePlusVerb(context, index)
        if (!found || !STATIVE_VERBS.has(found.verb.base)) return []
        const simpleForm = SIMPLE_TENSE_FOR_BE[found.be](found.verb, found.isNegated)
        return [
          {
            from: found.from,
            to: found.to,
            replacements: [found.subject ? `${found.subject} ${simpleForm}` : simpleForm],
            explanation: `"${found.verb.base}" describes a state, so it is not used with "${found.be}".`,
          },
        ]
      }),
  },
  {
    id: 'continuous-ing-form',
    category: CATEGORIES.tense,
    description: 'Use the -ing form after am/is/are/was/were for actions in progress',
    examples: [
      { incorrect: 'I am work on the report.', correct: 'I am working on the report.' },
      { incorrect: 'I was work late.', correct: 'I was working late.' },
      { incorrect: 'They are play football.', correct: 'They are playing football.' },
      { incorrect: "We're prepare the release.", correct: "We're preparing the release." },
    ],
    find: (context) =>
      context.tokens.flatMap((_, index) => {
        const found = findBePlusVerb(context, index)
        if (!found || STATIVE_VERBS.has(found.verb.base)) return []
        return [
          {
            from: found.to,
            to: found.to,
            replacements: [found.verb.ing],
            explanation: `Use the -ing form after "${found.be}": "${found.be} ${found.verb.ing}".`,
          },
        ]
      }),
  },
  {
    id: 'perfect-past-participle',
    category: CATEGORIES.tense,
    description: 'Use the past participle after have/has/had',
    examples: [
      { incorrect: 'I have saw that movie.', correct: 'I have seen that movie.' },
      { incorrect: 'She has went home.', correct: 'She has gone home.' },
      { incorrect: 'We have already ate lunch.', correct: 'We have already eaten lunch.' },
      { incorrect: "They haven't came yet.", correct: "They haven't come yet." },
      { incorrect: 'I has went to the market yesterday.', correct: 'I went to the market yesterday.' },
    ],
    find: (context) =>
      context.tokens.flatMap((token, index) => {
        if (!HAVE_AUXILIARIES.has(token.lower)) return []
        const cursor = skipWords(context, nextIndex(context, index), PERFECT_FILLERS)
        if (cursor === -1) return []
        const match = findVerbByForm(context.tokens[cursor].lower, [VERB_FORMS.past], {
          excludeForms: [VERB_FORMS.base, VERB_FORMS.participle],
        })
        // "have got" is standard English.
        if (!match || match.verb.base === 'get') return []
        // A finished time ("yesterday") takes the simple past: "has went" becomes "went", not "has gone".
        if (context.pastTimeMarker && PLAIN_HAVE_AUXILIARIES.has(token.lower) && cursor === nextIndex(context, index)) {
          const explanation = `"${context.pastTimeMarker}" refers to a finished time, so use the simple past "${match.verb.past}" without "${token.text}".`
          return [{ from: index, to: cursor, replacements: [match.verb.past], explanation }]
        }
        return [
          {
            from: cursor,
            to: cursor,
            replacements: [match.verb.participle],
            explanation: `Use the past participle "${match.verb.participle}" after "${token.text}".`,
          },
        ]
      }),
  },
  {
    id: 'past-time-expression',
    category: CATEGORIES.tense,
    description: 'Use the past tense with expressions such as "yesterday" or "last week"',
    examples: [
      { incorrect: 'Yesterday I go to the market.', correct: 'Yesterday I went to the market.' },
      { incorrect: 'I work late yesterday.', correct: 'I worked late yesterday.' },
      { incorrect: 'Last week she visit her parents.', correct: 'Last week she visited her parents.' },
      { incorrect: 'We finish the project two days ago.', correct: 'We finished the project two days ago.' },
    ],
    find: (context) => {
      // Only act on clear evidence: a past marker, no habit/duration words, and no verb already in the past.
      if (!context.pastTimeMarker || context.hasHabitOrDuration || context.hasPastVerb) return []
      return context.tokens.flatMap((token, index) => {
        if (!isPronoun(token, SUBJECT_PRONOUNS) || isSubjectBlocked(context, index)) return []
        const cursor = skipWords(context, nextIndex(context, index), FREQUENCY_ADVERBS)
        if (cursor === -1) return []
        const match = findVerbByForm(context.tokens[cursor].lower, [VERB_FORMS.base, VERB_FORMS.third], { excludeForms: [VERB_FORMS.past] })
        if (!match || match.verb.isAuxiliary) return []
        return [
          {
            from: cursor,
            to: cursor,
            replacements: [match.verb.past],
            explanation: `"${context.pastTimeMarker}" refers to the past, so use "${match.verb.past}".`,
          },
        ]
      })
    },
  },
  {
    id: 'third-person-singular',
    category: CATEGORIES.grammar,
    description: 'Add -s to present-tense verbs after he, she and it',
    examples: [
      { incorrect: 'He work in a bank.', correct: 'He works in a bank.' },
      { incorrect: 'She have a car.', correct: 'She has a car.' },
      { incorrect: 'It take time.', correct: 'It takes time.' },
      { incorrect: 'He always forget his keys.', correct: 'He always forgets his keys.' },
      { incorrect: 'I hope that it work.', correct: 'I hope that it works.' },
    ],
    find: (context) => {
      if (context.pastTimeMarker) return []
      return context.tokens.flatMap((token, index) => {
        if (!isPronoun(token, THIRD_PERSON_PRONOUNS) || isSubjectBlocked(context, index)) return []
        const cursor = skipWords(context, nextIndex(context, index), FREQUENCY_ADVERBS)
        if (cursor === -1) return []
        const match = findVerbByForm(context.tokens[cursor].lower, [VERB_FORMS.base], { excludeForms: [VERB_FORMS.past] })
        if (!match) return []
        return [{ from: cursor, to: cursor, replacements: [match.verb.third], explanation: `With "${token.lower}", use "${match.verb.third}".` }]
      })
    },
  },
  {
    id: 'plural-subject-base-verb',
    category: CATEGORIES.grammar,
    description: 'Do not add -s to present-tense verbs after I, you, we and they',
    examples: [
      { incorrect: 'They works hard.', correct: 'They work hard.' },
      { incorrect: 'I needs your help.', correct: 'I need your help.' },
      { incorrect: 'We has a meeting.', correct: 'We have a meeting.' },
    ],
    find: (context) => {
      if (context.pastTimeMarker) return []
      return context.tokens.flatMap((token, index) => {
        if (!isPronoun(token, OTHER_PRONOUNS) || isSubjectBlocked(context, index)) return []
        const cursor = skipWords(context, nextIndex(context, index), FREQUENCY_ADVERBS)
        if (cursor === -1) return []
        const match = findVerbByForm(context.tokens[cursor].lower, [VERB_FORMS.third])
        if (!match) return []
        const subject = token.lower === 'i' ? 'I' : token.lower
        return [{ from: cursor, to: cursor, replacements: [match.verb.base], explanation: `With "${subject}", use "${match.verb.base}".` }]
      })
    },
  },
]
