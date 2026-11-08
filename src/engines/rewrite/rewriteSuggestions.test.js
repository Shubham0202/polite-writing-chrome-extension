import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REWRITE_STYLES } from '../../constants/ai.js'
import { CATEGORIES, CONFIDENCE, ENGINES, SOURCES } from '../../constants/corrections.js'
import { applyDefaultSuggestions } from '../suggestion.js'
import {
  REWRITE_STYLE_EXPLANATION,
  alignRewriteBySentence,
  createWholeTextSuggestion,
  findAddedProtectedSpans,
  findChangedNumbers,
  findMissingProtectedSpans,
  isUnchangedRewrite,
  matchQuoteStyle,
} from './rewriteSuggestions.js'

const EXAMPLE = 'Hey shubham sir can I get the work from home for 2 days of next week that is Thursday and Friday. is this sentence is correct'
const EXAMPLE_REWRITE = 'Hey Shubham Sir, I wanted to ask if I could work from home on Thursday and Friday next week.'

describe('rewrite suggestions', () => {
  it('treats a rewrite that only differs in whitespace as unchanged', () => {
    assert.equal(isUnchangedRewrite('Hello there.\n', ' Hello there.'), true)
    assert.equal(isUnchangedRewrite('Thanks for the update.  Send me the logs.', 'Thanks for the update. Send me the logs.'), true)
    assert.equal(isUnchangedRewrite('Hello,world.', 'Hello, world.'), false)
    assert.equal(isUnchangedRewrite('Hi team. The build failed. Thanks.', 'Hi team.\n\nThe build failed.\n\nThanks.'), false, 'added paragraph breaks are a change')
  })

  it("keeps the writer's leading and trailing whitespace around a whole-text rewrite", () => {
    assert.deepEqual(createWholeTextSuggestion(' thanks for the help\n\n', 'Thanks for the help.', REWRITE_STYLES.polite).replacements, [' Thanks for the help.\n\n'])
  })

  it('lists numbers the rewrite altered or dropped, but not a single redundant digit', () => {
    assert.deepEqual(findChangedNumbers(EXAMPLE, EXAMPLE_REWRITE), [])
    assert.deepEqual(findChangedNumbers('Can we meet at 5 pm on the 15th?', 'Could we meet at 5 am on the 16th?'), ['16', '15'])
    assert.deepEqual(findChangedNumbers('Call me on 98765 43210 or 98765 43211.', 'Please call me on 98765 43210.'), ['43211'])
    assert.deepEqual(findChangedNumbers('It costs $1,200 for 2 seats at 10:30.', 'It costs $1,200 for two seats at 10:30.'), [])
  })

  it("matches the writer's quote style, and leaves curly quotes alone for a writer who uses them", () => {
    assert.equal(matchQuoteStyle("I don't know if it's \"fine\".", 'I don’t know if it’s “fine”.'), "I don't know if it's \"fine\".")
    assert.equal(matchQuoteStyle('I don’t know.', 'I don’t know if it’s fine.'), 'I don’t know if it’s fine.')
  })

  it('builds a whole-text suggestion in the shared suggestion shape', () => {
    const suggestion = createWholeTextSuggestion(EXAMPLE, EXAMPLE_REWRITE, REWRITE_STYLES.improveWording)
    assert.equal(suggestion.engine, ENGINES.rewrite)
    assert.equal(suggestion.source, SOURCES.ai)
    assert.equal(suggestion.category, CATEGORIES.wording)
    assert.equal(suggestion.confidence, CONFIDENCE.high)
    assert.equal(suggestion.offset, 0)
    assert.equal(suggestion.original, EXAMPLE)
    assert.deepEqual(suggestion.replacements, [EXAMPLE_REWRITE])
    assert.equal(suggestion.explanation, REWRITE_STYLE_EXPLANATION[REWRITE_STYLES.improveWording])
    assert.equal(applyDefaultSuggestions(EXAMPLE, [suggestion]), EXAMPLE_REWRITE)
  })

  it('leaves no replacement when the only difference is the apostrophe style', () => {
    assert.deepEqual(createWholeTextSuggestion("I don’t know.", "I don't know.", REWRITE_STYLES.improveWording).replacements, [])
  })

  describe('pairing sentences', () => {
    it('offers one suggestion per changed sentence when they line up', () => {
      const text = 'i am not coming office today. Thanks for helping me, I will tell you if need anything. Regards, Raj'
      const rewritten = "I won't be able to come to the office today. Thanks for your help, and I'll let you know if I need anything else. Regards, Raj"
      const suggestions = alignRewriteBySentence(text, rewritten, REWRITE_STYLES.friendly)
      assert.deepEqual(
        suggestions.map(({ original, replacements }) => [original, replacements[0]]),
        [
          ['i am not coming office today.', "I won't be able to come to the office today."],
          ['Thanks for helping me, I will tell you if need anything.', "Thanks for your help, and I'll let you know if I need anything else."],
        ],
      )
      assert.equal(applyDefaultSuggestions(text, suggestions), rewritten)
      assert.ok(suggestions.every(({ explanation }) => explanation === REWRITE_STYLE_EXPLANATION[REWRITE_STYLES.friendly]))
    })

    it("keeps the user's own spacing and line breaks when the model normalises them", () => {
      const spaced = 'Thanks for the update.  Send me the logs.'
      const [suggestion] = alignRewriteBySentence(spaced, 'Thanks for the update. Could you please send me the logs?', REWRITE_STYLES.polite)
      assert.equal(suggestion.original, 'Send me the logs.')
      assert.equal(applyDefaultSuggestions(spaced, [suggestion]), 'Thanks for the update.  Could you please send me the logs?')

      const lines = 'Hi team.\nThe build is failing.\nPls check.'
      const suggestions = alignRewriteBySentence(lines, 'Hi team. The build is failing. Could you please check?', REWRITE_STYLES.polite)
      assert.equal(applyDefaultSuggestions(lines, suggestions), 'Hi team.\nThe build is failing.\nCould you please check?')
    })

    it('gives up when sentences were merged, split, re-joined or re-ordered', () => {
      for (const [text, rewritten] of [
        ['Send it.Thanks', 'Could you send it? Thanks!'],
        ['It is done. Let me know.', 'It is done, so let me know.'],
        ['One.', 'One. Two.'],
        ['It works. Thanks for helping me I will tell you if need anything.', "It works. Thanks for your help! I'll let you know if I need anything else."],
        ['Send the report. Call the client.', 'Please call the client. Please send the report.'],
        ['Hello sir. Can you give me leave tomorrow because I have some personal work?', 'Hello Sir, could I please take leave tomorrow? I have some personal commitments.'],
        ['Hi sir. I am not coming office today because health is not good. Please inform team.', "Hi Sir, I won't be able to come to the office today. I'm not feeling well. Please inform the team."],
        [EXAMPLE, EXAMPLE_REWRITE],
      ]) {
        assert.equal(alignRewriteBySentence(text, rewritten, REWRITE_STYLES.polite), null, text)
      }
    })

    it('does not count words that merely repeat across sentences as borrowed', () => {
      const text = 'Please review the report. The report is due Friday.'
      const rewritten = 'Could you please review the report? The report is due on Friday.'
      assert.equal(alignRewriteBySentence(text, rewritten, REWRITE_STYLES.polite)?.length, 2)
    })
  })

  describe('protected spans', () => {
    const text = 'See https://example.com/docs?a=1, mail info@company.com and ping @raj about `fetchUser`.'

    it('finds links, addresses, mentions and code the rewrite dropped or changed', () => {
      assert.deepEqual(findMissingProtectedSpans(text, 'Please see https://example.com/docs?a=1, email info@company.com and ping @raj about `fetchUser`.'), [])
      assert.deepEqual(findMissingProtectedSpans(text, 'Please see the docs, email Info@Company.com and ping @raj about fetchUser.'), ['https://example.com/docs?a=1', 'info@company.com', '`fetchUser`'])
    })

    it('treats template placeholders like protected text', () => {
      const template = 'Hi {{FirstName}}, your order [order_id] for ${amount} ships on [date]; see {link} or %s.'
      assert.deepEqual(findMissingProtectedSpans(template, 'Hi {{FirstName}}, your order [order_id] for ${amount} will ship on [date]. See {link} or %s.'), [])
      assert.deepEqual(findMissingProtectedSpans(template, 'Hi {{First Name}}, your order [order id] for ${amount} ships on [date]; see {link} or %S.'), ['{{FirstName}}', '[order_id]', '%s'])
    })

    it('does not count an emoji, smart quote or ellipsis glued to a link as part of it', () => {
      for (const [text, rewritten] of [
        ['check this https://youtu.be/abc👍 and reply', 'Check this https://youtu.be/abc 👍 and reply.'],
        ['see “https://x.com/a” now', 'See "https://x.com/a" now.'],
        ['https://x.com/a… ok', 'https://x.com/a … okay.'],
      ]) {
        assert.deepEqual(findAddedProtectedSpans(text, rewritten), [], text)
        assert.deepEqual(findMissingProtectedSpans(text, rewritten), [], text)
      }
    })

    it('finds links, addresses, mentions and tags the rewrite added, ignoring added code formatting', () => {
      assert.deepEqual(findAddedProtectedSpans(text, 'Please see https://example.com/docs?a=1 and mail info@company.com. Ping @raj about `fetchUser`.'), [])
      assert.deepEqual(findAddedProtectedSpans('Send me the file.', 'Send me the file at http://evil.test/x or admin@evil.test, cc @boss #urgent.'), ['http://evil.test/x', 'admin@evil.test', '@boss', '#urgent'])
      assert.deepEqual(findAddedProtectedSpans('Call fetchUser twice.', 'Call `fetchUser` twice.'), [])
      assert.deepEqual(findAddedProtectedSpans('Mail a@b.com and a@b.com.', 'Mail a@b.com, a@b.com and a@b.com.'), ['a@b.com'])
    })
  })
})
