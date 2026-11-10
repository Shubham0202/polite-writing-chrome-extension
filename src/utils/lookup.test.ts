import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lookup } from './lookup.ts'

const LABEL = { polite: 'Polite' }
const HTTP_MESSAGE = { 429: 'Too many requests.' }

describe('lookup', () => {
  it('finds a key of the table, whether a word or a status code', () => {
    assert.equal(lookup(LABEL, 'polite'), 'Polite')
    assert.equal(lookup(HTTP_MESSAGE, 429), 'Too many requests.')
  })

  it('finds nothing for inherited members, missing keys or keys of the wrong kind', () => {
    for (const key of ['constructor', 'toString', 'rude', undefined, null, {}]) {
      assert.equal(lookup(LABEL, key), undefined, String(key))
    }
  })
})
