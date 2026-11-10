// Reported at the debug level (DevTools "Verbose") to help check real sites. Reports never include the user's text.
export const logDebug = (message: string, ...details: unknown[]): void => console.debug(`[WriteBetter] ${message}`, ...details)
