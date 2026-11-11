import type { Settings } from '../constants/settings.ts'
import { isGranted } from './permissionSync.ts'
import { parseSiteInput, toMatchPattern } from './settings.ts'

interface ManifestContentScript {
  matches: string[]
}

const SCRIPT_ID = 'custom-sites'

// Only hostnames the settings page would accept become match patterns, whatever else may have ended up in storage.
const toCustomSitePatterns = (customSites: string[]): string[] =>
  customSites.filter((site) => typeof site === 'string' && parseSiteInput(site) === site).map(toMatchPattern)

// The built-in sites are in the manifest; sites the user adds are registered here. A site whose permission was later
// taken back through Chrome is left out, because registering it would fail.
export const syncCustomSiteScripts = async ({ customSites }: Pick<Settings, 'customSites'>): Promise<void> => {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] })

  const patterns = toCustomSitePatterns(customSites)
  const permitted = await Promise.all(patterns.map(isGranted))
  const matches = patterns.filter((_: string, index: number) => permitted[index])
  if (!matches.length) return

  await chrome.scripting.registerContentScripts([{ id: SCRIPT_ID, js: ['content.js'], matches, allFrames: true, matchOriginAsFallback: true }])
}

// Chrome only runs content scripts in pages loaded after the extension, so tabs already open when it is installed or
// reloaded would stay without suggestions until refreshed. A tab already running the script ignores the second copy.
export const injectIntoOpenTabs = async ({ customSites }: Pick<Settings, 'customSites'>): Promise<void> => {
  const [{ matches }] = chrome.runtime.getManifest().content_scripts as ManifestContentScript[]
  const tabs = await chrome.tabs.query({ url: [...matches, ...toCustomSitePatterns(customSites)] })
  // A discarded tab, or a site whose permission was taken back, refuses the script; the other tabs still get it.
  await Promise.allSettled(
    tabs.map((tab) => chrome.scripting.executeScript({ target: { tabId: tab.id as number, allFrames: true }, files: ['content.js'] })),
  )
}
