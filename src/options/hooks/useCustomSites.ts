import { useEffect, useState } from 'react'
import type { Settings } from '../../constants/settings.ts'
import { findSitesWithoutAccess } from '../../services/permissionSync.ts'
import { isSiteListed, parseSiteInput, setSitePaused, toMatchPattern, updateSettings } from '../../services/settings.ts'

// Hostnames never contain spaces, so a space-joined list is a stable key for the effect below.
const SITE_SEPARATOR = ' '

const requestAccess = async (hostname: string) => {
  try {
    return await chrome.permissions.request({ origins: [toMatchPattern(hostname)] })
  } catch {
    return false
  }
}

export const useCustomSites = (settings: Settings | null) => {
  const [error, setError] = useState<string | null>(null)
  const [sitesWithoutAccess, setSitesWithoutAccess] = useState<readonly string[]>([])
  const sitesKey = settings?.customSites.join(SITE_SEPARATOR) ?? ''

  // Access can also be taken back, or given back, in chrome://extensions, so the list follows Chrome's own events.
  useEffect(() => {
    let isCancelled = false
    const sites = sitesKey ? sitesKey.split(SITE_SEPARATOR) : []
    const refresh = () => {
      findSitesWithoutAccess(sites)
        .then((revoked) => {
          if (!isCancelled) setSitesWithoutAccess(revoked)
        })
        .catch(() => {})
    }

    refresh()
    chrome.permissions.onAdded.addListener(refresh)
    chrome.permissions.onRemoved.addListener(refresh)
    return () => {
      isCancelled = true
      chrome.permissions.onAdded.removeListener(refresh)
      chrome.permissions.onRemoved.removeListener(refresh)
    }
  }, [sitesKey])

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

  // The site is already listed; only Chrome's access needs to come back, and the list updates from Chrome's event.
  const allowAgain = async (hostname: string) => {
    if (!(await requestAccess(hostname))) return refuse(`Chrome did not get permission for ${hostname}.`)
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

  return { error, sitesWithoutAccess, addSite, allowAgain, removeSite }
}
