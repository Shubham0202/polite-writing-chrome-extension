import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LOCAL_LANGUAGE_TOOL } from '../constants/settings.ts'
import { isLocalLanguageToolAllowed } from './localLanguageTool.ts'

describe('LanguageTool on this computer', () => {
  let stored: Record<string, unknown>
  let granted: string[]

  beforeEach(() => {
    stored = {}
    granted = []
    globalThis.chrome = {
      storage: {
        local: {
          get: async (key: string) => (key in stored ? { [key]: stored[key] } : {}),
        },
      },
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.includes(origin)),
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    delete (globalThis as { chrome?: typeof chrome }).chrome
  })

  it('is off by default, even when Chrome has access', async () => {
    granted = [LOCAL_LANGUAGE_TOOL.permissionPattern]
    assert.equal(await isLocalLanguageToolAllowed(), false)
  })

  it('needs both the switch and the access', async () => {
    stored.settings = { isLocalLanguageToolEnabled: true }
    assert.equal(await isLocalLanguageToolAllowed(), false)
    granted = [LOCAL_LANGUAGE_TOOL.permissionPattern]
    assert.equal(await isLocalLanguageToolAllowed(), true)
  })

  it('counts as off when the switch or the access cannot be read', async () => {
    stored.settings = { isLocalLanguageToolEnabled: true }
    chrome.permissions.contains = async () => {
      throw new Error('permissions unavailable')
    }
    assert.equal(await isLocalLanguageToolAllowed(), false)
    chrome.storage.local.get = async () => {
      throw new Error('storage unavailable')
    }
    assert.equal(await isLocalLanguageToolAllowed(), false)
  })

  it('asks for one address only, the one the requests go to', () => {
    assert.equal(LOCAL_LANGUAGE_TOOL.permissionPattern, `${LOCAL_LANGUAGE_TOOL.serverUrl}/*`)
    assert.equal(new URL(LOCAL_LANGUAGE_TOOL.serverUrl).hostname, 'localhost')
  })

  it('is an optional permission in the manifest, and no local address is granted at install', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'))
    assert.ok(manifest.optional_host_permissions.includes(LOCAL_LANGUAGE_TOOL.permissionPattern))
    for (const pattern of manifest.host_permissions) assert.doesNotMatch(pattern, /localhost|127\.0\.0\.1/, pattern)
  })
})
