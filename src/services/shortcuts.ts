import { lookup } from '../utils/lookup.ts'
import { COMMAND_MESSAGES } from './messaging.ts'

export interface DefaultShortcut {
  command: string
  shortcut: string
}

// Chrome assigns these keys only when nothing else in the profile already has them, and never again once the user has
// changed them, so a shortcut can stay unset. Extensions can read their shortcuts but cannot set them.
export const getDefaultShortcuts = (): DefaultShortcut[] =>
  Object.entries(chrome.runtime.getManifest().commands ?? {}).flatMap(([command, { suggested_key: suggestedKey }]) => {
    const shortcut = typeof suggestedKey === 'string' ? suggestedKey : suggestedKey?.default
    return shortcut ? [{ command, shortcut }] : []
  })

// Chrome also lists the toolbar button's own command, which this extension gives no key.
export const getShortcuts = async (): Promise<chrome.commands.Command[]> =>
  (await chrome.commands.getAll()).filter(({ name }) => lookup(COMMAND_MESSAGES, name) !== undefined)

export const isShortcutUnset = async (command: string): Promise<boolean> =>
  (await getShortcuts()).some(({ name, shortcut }) => name === command && !shortcut)
