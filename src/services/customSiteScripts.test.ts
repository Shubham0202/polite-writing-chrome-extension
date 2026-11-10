import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { injectIntoOpenTabs, syncCustomSiteScripts } from './customSiteScripts.ts'

interface MockTab {
  id: number | string
}

interface MockInjection {
  target: { tabId: number | string; allFrames: boolean }
  files: string[]
}

describe('custom site scripts', () => {
  let registered: Partial<chrome.scripting.RegisteredContentScript>[]
  let denied: Set<string>
  let openTabs: MockTab[]
  let queriedPatterns: string[] | null
  let injected: MockInjection[]

  beforeEach(() => {
    registered = []
    denied = new Set<string>()
    openTabs = []
    queriedPatterns = null
    injected = []
    globalThis.chrome = {
      permissions: { contains: async ({ origins: [origin] }: { origins: string[] }) => !denied.has(origin) },
      runtime: { getManifest: () => ({ content_scripts: [{ matches: ['https://mail.google.com/*', 'https://chat.google.com/*'] }] }) },
      tabs: {
        query: async ({ url }: { url: string[] }) => {
          queriedPatterns = url
          return openTabs
        },
      },
      scripting: {
        executeScript: async (injection: MockInjection) => {
          if (injection.target.tabId === 'discarded') throw new Error('Cannot access contents of the page')
          injected.push(injection)
        },
        getRegisteredContentScripts: async () => registered,
        unregisterContentScripts: async () => {
          registered = []
        },
        registerContentScripts: async (scripts: Partial<chrome.scripting.RegisteredContentScript>[]) => {
          registered = scripts
        },
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    delete (globalThis as { chrome?: typeof chrome }).chrome
  })

  it('registers the sites the user added', async () => {
    await syncCustomSiteScripts({ customSites: ['example.com', 'docs.example.org'] })
    assert.deepEqual(registered[0].matches, ['*://example.com/*', '*://docs.example.org/*'])
    assert.deepEqual(registered[0].js, ['content.js'])
  })

  it('replaces the previous list rather than adding to it', async () => {
    await syncCustomSiteScripts({ customSites: ['example.com'] })
    await syncCustomSiteScripts({ customSites: ['other.com'] })
    assert.equal(registered.length, 1)
    assert.deepEqual(registered[0].matches, ['*://other.com/*'])
  })

  it('registers nothing when the last site is removed', async () => {
    await syncCustomSiteScripts({ customSites: ['example.com'] })
    await syncCustomSiteScripts({ customSites: [] })
    assert.deepEqual(registered, [])
  })

  it('starts the script in every frame of open tabs on built-in and added sites', async () => {
    openTabs = [{ id: 1 }, { id: 2 }]
    await injectIntoOpenTabs({ customSites: ['example.com'] })
    assert.deepEqual(queriedPatterns, ['https://mail.google.com/*', 'https://chat.google.com/*', '*://example.com/*'])
    assert.deepEqual(injected, [1, 2].map((tabId) => ({ target: { tabId, allFrames: true }, files: ['content.js'] })))
  })

  it('still starts it in the other tabs when one refuses', async () => {
    openTabs = [{ id: 'discarded' }, { id: 2 }]
    await injectIntoOpenTabs({ customSites: [] })
    assert.deepEqual(injected.map(({ target }) => target.tabId), [2])
  })

  it('leaves out a site whose permission was taken back', async () => {
    denied.add('*://example.com/*')
    await syncCustomSiteScripts({ customSites: ['example.com', 'other.com'] })
    assert.deepEqual(registered[0].matches, ['*://other.com/*'])
  })

  it('leaves out stored entries that are not plain hostnames', async () => {
    openTabs = [{ id: 1 }]
    const customSites = ['example.com', '*://*/*', '<all_urls>', 'example.com/path', 'Example.org', 42, null, 'localhost'] as unknown as string[]
    await syncCustomSiteScripts({ customSites })
    assert.deepEqual(registered[0].matches, ['*://example.com/*', '*://localhost/*'])
    await injectIntoOpenTabs({ customSites })
    assert.deepEqual(queriedPatterns, ['https://mail.google.com/*', 'https://chat.google.com/*', '*://example.com/*', '*://localhost/*'])
  })
})
