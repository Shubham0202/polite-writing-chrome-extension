import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DEFAULT_SETTINGS, LOCAL_LANGUAGE_TOOL, type Settings } from '../constants/settings.ts'
import { findSettingsWithoutAccess, findSitesWithoutAccess } from './permissionSync.ts'

describe('settings that lost their Chrome access', () => {
  let granted: string[]

  beforeEach(() => {
    granted = []
    globalThis.chrome = {
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.includes(origin)),
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    delete (globalThis as { chrome?: typeof chrome }).chrome
  })

  const withSettings = (changes: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...changes })

  it('changes nothing while every setting still has its access', async () => {
    granted = [LOCAL_LANGUAGE_TOOL.permissionPattern, '*://example.com/*']
    assert.deepEqual(await findSettingsWithoutAccess(withSettings({ isLocalLanguageToolEnabled: true, customSites: ['example.com'] })), {})
    assert.deepEqual(await findSettingsWithoutAccess(DEFAULT_SETTINGS), {})
  })

  it('turns the local LanguageTool server off once its access is gone, and leaves it alone when already off', async () => {
    assert.deepEqual(await findSettingsWithoutAccess(withSettings({ isLocalLanguageToolEnabled: true })), { isLocalLanguageToolEnabled: false })
    assert.deepEqual(await findSettingsWithoutAccess(withSettings({ isLocalLanguageToolEnabled: false })), {})
  })

  it('keeps added sites listed when their access is gone, with their pause entries', async () => {
    const settings = withSettings({ customSites: ['kept.example', 'gone.example'], pausedSites: ['gone.example', 'mail.google.com'] })
    assert.deepEqual(await findSettingsWithoutAccess(settings), {})
  })

  it('names the added sites whose access is gone, in list order', async () => {
    granted = ['*://kept.example/*']
    assert.deepEqual(await findSitesWithoutAccess(['gone.example', 'kept.example', 'also-gone.example']), ['gone.example', 'also-gone.example'])
    granted = ['*://kept.example/*', '*://gone.example/*', '*://also-gone.example/*']
    assert.deepEqual(await findSitesWithoutAccess(['gone.example', 'kept.example', 'also-gone.example']), [])
    assert.deepEqual(await findSitesWithoutAccess([]), [])
  })
})
