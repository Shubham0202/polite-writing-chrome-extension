import { useState } from 'react'
import { LOCAL_LANGUAGE_TOOL } from '../../constants/settings.ts'
import { updateSettings } from '../../services/settings.ts'

const ACCESS = { origins: [LOCAL_LANGUAGE_TOOL.permissionPattern] }

const requestAccess = async () => {
  try {
    return await chrome.permissions.request(ACCESS)
  } catch {
    return false
  }
}

export const useLocalLanguageTool = () => {
  const [error, setError] = useState<string | null>(null)

  const setIsEnabled = async (isEnabled: boolean) => {
    // Chrome only shows this prompt straight after a click, so nothing may be awaited before it.
    if (isEnabled && !(await requestAccess())) return setError(`Chrome did not get permission for ${LOCAL_LANGUAGE_TOOL.serverUrl}.`)
    setError(null)
    await updateSettings({ isLocalLanguageToolEnabled: isEnabled })
    // Turning it off gives the access back, as removing a site does.
    if (!isEnabled) await chrome.permissions.remove(ACCESS).catch(() => {})
  }

  return { error, setIsEnabled }
}
