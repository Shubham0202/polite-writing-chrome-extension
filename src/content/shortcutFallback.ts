import { lookup } from '../utils/lookup.ts'

export type KeyPress = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

type ModifierFlag = 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'

type ManifestModifier = 'Ctrl' | 'MacCtrl' | 'Alt' | 'Shift' | 'Command' | 'Search'

const MODIFIER_FLAGS: readonly ModifierFlag[] = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey']

// Search is the ChromeOS key that sets metaKey.
const MODIFIER_FLAG: Record<ManifestModifier, ModifierFlag> = {
  Ctrl: 'ctrlKey',
  MacCtrl: 'ctrlKey',
  Alt: 'altKey',
  Shift: 'shiftKey',
  Command: 'metaKey',
  Search: 'metaKey',
}

// On a Mac, Chrome reads Ctrl in a manifest shortcut as the Command key; MacCtrl is the Control key there.
const MAC_MODIFIER_FLAG: Record<ManifestModifier, ModifierFlag> = { ...MODIFIER_FLAG, Ctrl: 'metaKey' }

// Manifest shortcuts name keys as KeyboardEvent.code does, without its Key, Digit and Arrow prefixes: G, 5, Space, Up.
const getKeyName = (code: string) => code.replace(/^(Key|Digit|Arrow)/, '')

// Compares a key press with a manifest shortcut such as "Ctrl+Shift+Space": the same key, and exactly its modifiers.
export const matchesShortcut = (keyPress: KeyPress, shortcut: string, isMac: boolean): boolean => {
  const modifiers = shortcut.split('+')
  const key = modifiers.pop()
  const flags = new Set(modifiers.map((modifier) => lookup(isMac ? MAC_MODIFIER_FLAG : MODIFIER_FLAG, modifier)))
  return getKeyName(keyPress.code) === key && MODIFIER_FLAGS.every((flag) => keyPress[flag] === flags.has(flag))
}
