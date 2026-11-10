import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findEdit, rebaseSuggestions } from './textRebase.ts'

const suggestion = (text: string, original: string) => ({ offset: text.indexOf(original), length: original.length, original })
const rebase = (before: string, after: string, original: string) => rebaseSuggestions([suggestion(before, original)], findEdit(before, after), after)

describe('text rebase', () => {
  it('finds an insertion, a deletion and a replacement', () => {
    assert.deepEqual(findEdit('hello world', 'hello big world'), { start: 6, oldEnd: 6, newEnd: 10 })
    assert.deepEqual(findEdit('hello big world', 'hello world'), { start: 6, oldEnd: 10, newEnd: 6 })
    assert.deepEqual(findEdit('a cat sat', 'a dog sat'), { start: 2, oldEnd: 5, newEnd: 5 })
  })

  it('treats repeated characters as one edit without overlapping itself', () => {
    assert.deepEqual(findEdit('aaa', 'aaaa'), { start: 3, oldEnd: 3, newEnd: 4 })
    assert.deepEqual(findEdit('', 'abc'), { start: 0, oldEnd: 0, newEnd: 3 })
  })

  it('keeps a suggestion before the edit where it was', () => {
    assert.deepEqual(rebase('i recieve it', 'i recieve it now', 'recieve'), [{ offset: 2, length: 7, original: 'recieve' }])
  })

  it('moves a suggestion after the edit with the text', () => {
    assert.deepEqual(rebase('i recieve it', 'yes i recieve it', 'recieve'), [{ offset: 6, length: 7, original: 'recieve' }])
  })

  it('drops a suggestion the edit landed inside', () => {
    assert.deepEqual(rebase('i recieve it', 'i receive it', 'recieve'), [])
    assert.deepEqual(rebase('i recieve it', 'i reXcieve it', 'recieve'), [])
  })

  it('drops a suggestion when the word itself was extended', () => {
    assert.deepEqual(rebase('i recieve it', 'i recieved it', 'recieve'), [])
    assert.deepEqual(rebase('i recieve it', 'i xrecieve it', 'recieve'), [])
  })

  it('keeps a suggestion when a space or punctuation is typed right next to it', () => {
    assert.equal(rebase('i recieve', 'i recieve ', 'recieve').length, 1)
    assert.equal(rebase('i recieve', 'i recieve.', 'recieve').length, 1)
    assert.deepEqual(rebase('recieve it', ' recieve it', 'recieve'), [{ offset: 1, length: 7, original: 'recieve' }])
  })

  it('moves an insertion suggestion, which has no text of its own', () => {
    const insertion = { offset: 5, length: 0, original: '' }
    assert.deepEqual(rebaseSuggestions([insertion], findEdit('hello', 'oh hello'), 'oh hello'), [{ offset: 8, length: 0, original: '' }])
  })

  it('drops a suggestion whose text no longer matches', () => {
    const stale = { offset: 0, length: 3, original: 'cat' }
    assert.deepEqual(rebaseSuggestions([stale], { start: 10, oldEnd: 10, newEnd: 11 }, 'dog sat on the mat'), [])
  })
})
