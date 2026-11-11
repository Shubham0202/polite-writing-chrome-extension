import { LOCAL_LANGUAGE_TOOL } from '../constants/settings.ts'
import { getSettings } from './settings.ts'

// The switch is the user's choice and the permission is Chrome's record of it. Both must agree, so access taken back in
// chrome://extensions stops the requests even while the switch still says on. Anything that cannot be read counts as
// off: the check still runs, with the built-in rules.
export const isLocalLanguageToolAllowed = async (): Promise<boolean> => {
  try {
    if (!(await getSettings()).isLocalLanguageToolEnabled) return false
    return await chrome.permissions.contains({ origins: [LOCAL_LANGUAGE_TOOL.permissionPattern] })
  } catch {
    return false
  }
}
