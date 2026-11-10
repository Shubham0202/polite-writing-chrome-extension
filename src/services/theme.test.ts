import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { THEMES } from '../constants/settings.ts'
import { resolveTheme, watchTheme, type ColorScheme } from './theme.ts'

interface FakeMediaQuery {
  matches: boolean
  addEventListener: (type: string, listener: () => void) => void
}

// matchMedia is not part of Node's globals, so the tests put a stand-in there through this view.
const testGlobal: { matchMedia?: unknown } = globalThis

describe('theme', () => {
  describe('resolveTheme', () => {
    it('uses Light or Dark as chosen, whatever the OS uses', () => {
      assert.equal(resolveTheme(THEMES.light, true), THEMES.light)
      assert.equal(resolveTheme(THEMES.dark, false), THEMES.dark)
    })

    it('follows the OS for System', () => {
      assert.equal(resolveTheme(THEMES.system, true), THEMES.dark)
      assert.equal(resolveTheme(THEMES.system, false), THEMES.light)
    })
  })

  describe('watchTheme', () => {
    let systemDarkQuery: FakeMediaQuery
    let changeListeners: (() => void)[]

    const switchOs = (isDark: boolean) => {
      systemDarkQuery.matches = isDark
      changeListeners.forEach((listener) => listener())
    }

    beforeEach(() => {
      changeListeners = []
      systemDarkQuery = { matches: false, addEventListener: (_type, listener) => changeListeners.push(listener) }
      testGlobal.matchMedia = () => systemDarkQuery
    })

    afterEach(() => {
      delete testGlobal.matchMedia
    })

    it('starts on System, so the OS theme applies before the setting loads', () => {
      systemDarkQuery.matches = true
      const colorSchemes: ColorScheme[] = []
      watchTheme((colorScheme) => colorSchemes.push(colorScheme))
      assert.deepEqual(colorSchemes, [THEMES.dark])
    })

    it('follows the OS switching over while on System, but not once Light or Dark is chosen', () => {
      const colorSchemes: ColorScheme[] = []
      const setTheme = watchTheme((colorScheme) => colorSchemes.push(colorScheme))
      switchOs(true)
      setTheme(THEMES.light)
      switchOs(false)
      switchOs(true)
      assert.deepEqual(colorSchemes, [THEMES.light, THEMES.dark, THEMES.light, THEMES.light, THEMES.light])
    })
  })
})
