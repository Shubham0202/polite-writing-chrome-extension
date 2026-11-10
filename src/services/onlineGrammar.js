const STORAGE_KEY = 'isOnlineGrammarEnabled'

// Off until the user turns it on, because it sends their text to an outside service.
export const getOnlineGrammarEnabled = async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] === true

export const setOnlineGrammarEnabled = (isEnabled) => chrome.storage.local.set({ [STORAGE_KEY]: isEnabled })

// The request alone is not enough, so no caller can send text out unless the stored switch agrees. A switch that
// cannot be read counts as off, so the check still runs, on this device.
export const isOnlineGrammarAllowed = async (isRequested) => isRequested === true && (await getOnlineGrammarEnabled().catch(() => false))
