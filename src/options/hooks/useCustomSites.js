import { useState } from 'react'
import { isSiteListed, parseSiteInput, setSitePaused, toMatchPattern, updateSettings } from '../../services/settings.js'

const requestAccess = async (hostname) => {
  try {
    return await chrome.permissions.request({ origins: [toMatchPattern(hostname)] })
  } catch {
    return false
  }
}

export const useCustomSites = (settings) => {
  const [error, setError] = useState(null)

  const refuse = (message) => {
    setError(message)
    return false
  }

  const addSite = async (input) => {
    const hostname = parseSiteInput(input)
    if (!hostname) return refuse('Enter a website address, such as example.com.')
    if (isSiteListed(settings, hostname)) return refuse(`${hostname} is already on the list.`)

    // Chrome only shows this prompt straight after a click, so nothing may be awaited before it.
    if (!(await requestAccess(hostname))) return refuse(`Chrome did not get permission for ${hostname}.`)

    await updateSettings({ customSites: [...settings.customSites, hostname] })
    setError(null)
    return true
  }

  const removeSite = async (hostname) => {
    await updateSettings({
      customSites: settings.customSites.filter((site) => site !== hostname),
      pausedSites: setSitePaused(settings, hostname, false),
    })
    await chrome.permissions.remove({ origins: [toMatchPattern(hostname)] })
  }

  return { error, addSite, removeSite }
}
