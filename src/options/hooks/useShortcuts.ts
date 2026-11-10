import { useEffect, useState } from 'react'
import { getShortcuts } from '../../services/shortcuts.ts'

// Null until Chrome has listed them.
export const useShortcuts = () => {
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[] | null>(null)

  useEffect(() => {
    let isCancelled = false

    const readShortcuts = () => {
      getShortcuts()
        .then((commands) => {
          if (!isCancelled) setShortcuts(commands)
        })
        .catch(() => {})
    }

    readShortcuts()
    // Chrome has no event for shortcut changes, which are made on its own page, so they are read again on coming back.
    addEventListener('focus', readShortcuts)

    return () => {
      isCancelled = true
      removeEventListener('focus', readShortcuts)
    }
  }, [])

  return shortcuts
}
