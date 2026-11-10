import { useState } from 'react'
import type { Settings } from '../../constants/settings.ts'
import { isSiteListed, parseSiteInput, setSitePaused, toMatchPattern, updateSettings } from '../../services/settings.ts'

const requestAccess = async (hostname: string) => {
  try {
    return await chrome.permissions.request({ origins: [toMatchPattern(hostname)] })
  } catch {
    return false
  }
}

export const useCustomSites = (settings: Settings | null) => {
  const [error, setError] = useState<string | null>(null)

  const refuse = (message: string) => {
    setError(message)
    return false
  }

  const addSite = async (input: string) => {
    const hostname = parseSiteInput(input)
    if (!hostname) return refuse('Enter a website address, such as example.com.')
    if (isSiteListed(settings!, hostname)) return refuse(`${hostname} is already on the list.`)

    // Chrome only shows this prompt straight after a click, so nothing may be awaited before it.
    if (!(await requestAccess(hostname))) return refuse(`Chrome did not get permission for ${hostname}.`)

    await updateSettings({ customSites: [...settings!.customSites, hostname] })
    setError(null)
    return true
  }

  const removeSite = async (hostname: string) => {
    await updateSettings({
      customSites: settings!.customSites.filter((site) => site !== hostname),
      pausedSites: setSitePaused(settings!, hostname, false),
    })
    await chrome.permissions.remove({ origins: [toMatchPattern(hostname)] })
  }

  return { error, addSite, removeSite }
}
