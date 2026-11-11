import { LOCAL_LANGUAGE_TOOL, type Settings } from '../constants/settings.ts'
import { toMatchPattern } from './settings.ts'

export const isGranted = (pattern: string): Promise<boolean> => chrome.permissions.contains({ origins: [pattern] })

// Access can be taken back in chrome://extensions without Settings knowing. Nothing is sent without it either way, since
// every request checks the access first; this only keeps Settings showing what really works. Access is checked against
// what Chrome grants now, rather than read from the removal event, whose patterns can take several forms.
export const findSettingsWithoutAccess = async (settings: Settings): Promise<Partial<Settings>> =>
  settings.isLocalLanguageToolEnabled && !(await isGranted(LOCAL_LANGUAGE_TOOL.permissionPattern)) ? { isLocalLanguageToolEnabled: false } : {}

// Added sites stay listed when their access is gone, so the user can allow them again instead of adding them anew.
export const findSitesWithoutAccess = async (customSites: readonly string[]): Promise<string[]> => {
  const granted = await Promise.all(customSites.map((site) => isGranted(toMatchPattern(site))))
  return customSites.filter((_site, index) => !granted[index])
}
