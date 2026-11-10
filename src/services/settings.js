import { BUILT_IN_SITES, DEFAULT_SETTINGS } from '../constants/settings.js'
import { matchesSite } from '../utils/siteMatch.js'
import { onStorageValueChanged } from './storageChanges.js'

const STORAGE_KEY = 'settings'
const HOSTNAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

export const normalizeSettings = (stored) => ({ ...DEFAULT_SETTINGS, ...stored })

export const getSettings = async () => normalizeSettings((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY])

export const updateSettings = async (changes) => {
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...(await getSettings()), ...changes } })
}

export const onSettingsChanged = (listener) =>
  onStorageValueChanged(STORAGE_KEY, (newValue, oldValue) => listener(normalizeSettings(newValue), normalizeSettings(oldValue)))

export const isSiteListed = ({ customSites }, hostname) =>
  [...BUILT_IN_SITES.map((site) => site.hostname), ...customSites].some((site) => matchesSite(site, hostname))

export const isSitePaused = ({ pausedSites }, hostname) => pausedSites.some((site) => matchesSite(site, hostname))

export const isAssistanceActive = (settings, hostname) =>
  settings.isInlineEnabled && isSiteListed(settings, hostname) && !isSitePaused(settings, hostname)

// Resuming clears every entry covering the site, which may be broader than the site itself ("*.atlassian.net").
export const setSitePaused = ({ pausedSites }, hostname, isPaused) => {
  const others = pausedSites.filter((site) => !matchesSite(site, hostname))
  return isPaused ? [...others, hostname] : others
}

// A site paused from the popup may not have a row of its own ("acme.atlassian.net"), but it still needs a way back.
export const getSiteRows = ({ customSites, pausedSites }) => {
  const rows = [...BUILT_IN_SITES, ...customSites.map((hostname) => ({ label: hostname, hostname, isCustom: true }))]
  const pausedOnly = pausedSites.filter((site) => !rows.some(({ hostname }) => hostname === site))
  return [...rows, ...pausedOnly.map((hostname) => ({ label: hostname, hostname }))]
}

export const parseSiteInput = (input) => {
  const trimmedInput = input.trim().toLowerCase()
  if (!trimmedInput) return null

  try {
    const { hostname } = new URL(trimmedInput.includes('://') ? trimmedInput : `https://${trimmedInput}`)
    return HOSTNAME_PATTERN.test(hostname) || hostname === 'localhost' ? hostname : null
  } catch {
    return null
  }
}

export const toMatchPattern = (hostname) => `*://${hostname}/*`
