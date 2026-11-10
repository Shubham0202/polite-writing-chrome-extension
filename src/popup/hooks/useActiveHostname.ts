import { useEffect, useState } from 'react'

export const useActiveHostname = () => {
  const [hostname, setHostname] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        // Chrome only shares the address of sites the extension has access to, which are the only ones to pause.
        if (!isCancelled && tab?.url) setHostname(new URL(tab.url).hostname)
      })
      .catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [])

  return hostname
}
