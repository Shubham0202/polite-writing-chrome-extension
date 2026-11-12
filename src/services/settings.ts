import { REWRITE_STYLES, type RewriteStyle } from '../constants/ai.ts'
import { BUILT_IN_SITES, CARD_SETTING_KEYS, DEFAULT_SETTINGS, type CardSettingKey, type Settings } from '../constants/settings.ts'
import { lookup } from '../utils/lookup.ts'
import { matchesSite } from '../utils/siteMatch.ts'
import { onStorageValueChanged } from './storageChanges.ts'

const STORAGE_KEY = 'settings'
const HOSTNAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

export interface SiteRow {
  label: string
  hostname: string
  isCustom?: boolean
}

export const normalizeSettings = (stored?: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...stored })

export const getSettings = async (): Promise<Settings> =>
  normalizeSettings((await chrome.storage.local.get<{ settings?: Partial<Settings> }>(STORAGE_KEY))[STORAGE_KEY])

export const updateSettings = async (changes: Partial<Settings>): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...(await getSettings()), ...changes } })
}

export const onSettingsChanged = (listener: (settings: Settings, previous: Settings) => void): (() => void) =>
  onStorageValueChanged<Partial<Settings>>(STORAGE_KEY, (newValue, oldValue) => listener(normalizeSettings(newValue), normalizeSettings(oldValue)))

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isRewriteStyle = (value: unknown): value is RewriteStyle => Object.values<unknown>(REWRITE_STYLES).includes(value)

const CARD_SETTING_VALIDATORS: { [Key in CardSettingKey]: (value: unknown) => value is Settings[Key] } = {
  [CARD_SETTING_KEYS.aiShortcut]: isBoolean,
  [CARD_SETTING_KEYS.aiShortcutStyle]: isRewriteStyle,
  [CARD_SETTING_KEYS.closeOnAccept]: isBoolean,
}

// The change a content script asked for, or null when it names another setting or brings a value of the wrong kind.
export const toCardSettingChange = (key: unknown, value: unknown): Partial<Settings> | null =>
  lookup(CARD_SETTING_VALIDATORS, key)?.(value) ? ({ [key as CardSettingKey]: value } as Partial<Settings>) : null

export const isSiteListed = ({ customSites }: Settings, hostname: string): boolean =>
  [...BUILT_IN_SITES.map((site) => site.hostname), ...customSites].some((site) => matchesSite(site, hostname))

export const isSitePaused = ({ pausedSites }: Settings, hostname: string): boolean => pausedSites.some((site) => matchesSite(site, hostname))

export const isAssistanceActive = (settings: Settings, hostname: string): boolean =>
  settings.isInlineEnabled && isSiteListed(settings, hostname) && !isSitePaused(settings, hostname)

// Resuming clears every entry covering the site, which may be broader than the site itself ("*.atlassian.net").
export const setSitePaused = ({ pausedSites }: Settings, hostname: string, isPaused: boolean): string[] => {
  const others = pausedSites.filter((site) => !matchesSite(site, hostname))
  return isPaused ? [...others, hostname] : others
}

// A site paused from the popup may not have a row of its own ("acme.atlassian.net"), but it still needs a way back.
export const getSiteRows = ({ customSites, pausedSites }: Settings): SiteRow[] => {
  const rows: SiteRow[] = [...BUILT_IN_SITES, ...customSites.map((hostname) => ({ label: hostname, hostname, isCustom: true }))]
  const pausedOnly = pausedSites.filter((site) => !rows.some(({ hostname }) => hostname === site))
  return [...rows, ...pausedOnly.map((hostname) => ({ label: hostname, hostname }))]
}

export const parseSiteInput = (input: string): string | null => {
  const trimmedInput = input.trim().toLowerCase()
  if (!trimmedInput) return null

  try {
    const { hostname } = new URL(trimmedInput.includes('://') ? trimmedInput : `https://${trimmedInput}`)
    return HOSTNAME_PATTERN.test(hostname) || hostname === 'localhost' ? hostname : null
  } catch {
    return null
  }
}

export const toMatchPattern = (hostname: string): string => `*://${hostname}/*`
