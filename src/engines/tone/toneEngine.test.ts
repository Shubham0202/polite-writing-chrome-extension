import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TONES } from '../../constants/corrections.ts'
import { applyDefaultSuggestions } from '../suggestion.ts'
import { checkTone } from './toneEngine.ts'

const rewrite = (text: string, tone: unknown): string => applyDefaultSuggestions(text, checkTone(text, tone))

describe('polite tone', () => {
  for (const [direct, polite] of [
    ['can you check the current ticket info', 'Could you please check the current ticket information?'],
    ['Send me the file.', 'Could you please send me the file?'],
    ['Can you send me the document?', 'Could you please send me the document?'],
    ['Could you send me the document?', 'Could you please send me the document?'],
    ['Fix this issue.', 'Could you please look into this issue?'],
    ['Tell me the update.', 'Could you please share an update?'],
    ['I need this urgently.', 'I would appreciate it if this could be prioritized.'],
    ['You are wrong.', 'I believe there may be a misunderstanding.'],
    ['Do this quickly.', 'Could you please complete this at your earliest convenience?'],
    ['I want the report by Friday.', 'I would like the report by Friday.'],
    ["Don't touch the config.", 'Please do not touch the config.'],
    ['Tell me when you are free!', 'Could you please let me know when you are free?'],
    ['I need you to review the PR asap.', 'I would appreciate it if you could review the PR as soon as possible.'],
  ]) {
    it(`"${direct}" → "${polite}"`, () => assert.equal(rewrite(direct, TONES.polite), polite))
  }

  it('leaves already-polite and neutral sentences alone', () => {
    for (const text of [
      'Could you please send me the file?',
      'Please send me the report by Friday.',
      'Would you mind sharing the document?',
      'Thank you for your help.',
      'Do you know where the file is?',
      'Take care.',
      "Let's meet tomorrow.",
      'Can you believe it?',
    ]) {
      assert.deepEqual(checkTone(text, TONES.polite), [], text)
    }
  })

  it('rewrites each sentence separately and keeps the others', () => {
    const text = 'Thanks for the update. Send me the logs. The build failed.'
    assert.equal(rewrite(text, TONES.polite), 'Thanks for the update. Could you please send me the logs? The build failed.')
  })

  it('explains what changed', () => {
    const [suggestion] = checkTone('can you check the current ticket info', TONES.polite)
    assert.equal(suggestion.explanation, 'Softened the request with "Could you please"; "info" → "information".')
  })
})

describe('professional tone', () => {
  for (const [casual, professional] of [
    ['can you check the current ticket info', 'Could you please review the information in the current ticket?'],
    ['Kindly send me the file.', 'Please send me the file.'],
    ['Please revert back asap.', 'Please respond at your earliest convenience.'],
    ['Hi team, I wanna share an update.', 'Hello team, I would like to share an update.'],
    ['Thanks for your help!', 'Thank you for your help!'],
    ['Please do the needful.', 'Could you please take the necessary action?'],
    [
      'Sir, I am not able to complete this task because I was facing some issue yesterday.',
      'Sir, I am unable to complete this task because I was experiencing an issue yesterday. I apologize for the delay.',
    ],
  ]) {
    it(`"${casual}" → "${professional}"`, () => assert.equal(rewrite(casual, TONES.professional), professional))
  }

  it('keeps the undo meaning of "revert"', () => {
    assert.deepEqual(checkTone('We will revert the change.', TONES.professional), [])
  })

  it('adds the apology only once and never when one exists', () => {
    const text = "I couldn't finish the report. I couldn't submit the form."
    assert.equal(
      rewrite(text, TONES.professional),
      "I couldn't finish the report. I apologize for the delay. I couldn't submit the form.",
    )
    assert.deepEqual(checkTone("Sorry, I couldn't finish the report.", TONES.professional), [])
  })

  it('rejects unknown tones', () => {
    assert.throws(() => checkTone('Send it.', 'rude'), /not available/)
  })
})

describe('tone breaking scenarios', () => {
  for (const [input, tone, expected] of [
    ['Can you send it please?', TONES.polite, 'Could you please send it?'],
    ['Send me the file, please.', TONES.polite, 'Could you please send me the file?'],
    ['Fix this issue please', TONES.polite, 'Could you please look into this issue?'],
    ['kindly do the needful', TONES.professional, 'Could you please take the necessary action?'],
    ['Kindly please send the file.', TONES.professional, 'Please send the file.'],
    ['Send it ASAP.', TONES.polite, 'Could you please send it as soon as possible?'],
    ['Share the INFO soon.', TONES.polite, 'Could you please share the information soon?'],
    ['SEND ME THE FILE.', TONES.polite, 'Could you please SEND ME THE FILE?'],
    ['Hi team, send me the report.', TONES.professional, 'Hello team, could you please send me the report?'],
    ['Hi, any update?', TONES.polite, 'Hi, could you please share an update?'],
    ['Can you check the following:', TONES.polite, 'Could you please check the following:'],
    ['Mail info@company.com for the info.', TONES.polite, 'Mail info@company.com for the information.'],
    ['Check https://example.com/info?a,b today.', TONES.professional, 'Could you please check https://example.com/info?a,b today?'],
    ['I couldn’t finish the report.', TONES.polite, 'I couldn’t finish the report. I apologize for the delay.'],
  ]) {
    it(`${tone}: "${input}" → "${expected}"`, () => assert.equal(rewrite(input, tone), expected))
  }

  it('leaves meaning-sensitive phrases alone', () => {
    for (const text of [
      'Thanks to the team, we shipped.',
      'Check it out.',
      'Please check the box.',
      'Hi-Fi audio is great.',
      "I can't send you the money.",
      'I cannot attend the meeting.',
      'constructor',
      '__proto__',
    ]) {
      assert.deepEqual(checkTone(text, TONES.professional), [], text)
    }
  })
})
