const STORAGE_KEY = 'isOnlineGrammarEnabled'

// On until the user turns it off. It only ever applies to the popup's Fix Grammar and Fix Everything buttons, which the
// user presses on purpose; checks as you type never use it.
export const getOnlineGrammarEnabled = async (): Promise<boolean> =>
  (await chrome.storage.local.get<{ isOnlineGrammarEnabled?: unknown }>(STORAGE_KEY))[STORAGE_KEY] !== false

export const setOnlineGrammarEnabled = (isEnabled: boolean): Promise<void> => chrome.storage.local.set({ [STORAGE_KEY]: isEnabled })

// The request alone is not enough, so no caller can send text out unless the stored switch agrees. A switch that
// cannot be read counts as off, so the check still runs, on this device.
export const isOnlineGrammarAllowed = async (isRequested: unknown): Promise<boolean> => isRequested === true && (await getOnlineGrammarEnabled().catch(() => false))
