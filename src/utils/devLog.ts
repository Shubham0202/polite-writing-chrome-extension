// Set by vite.config.js from the build mode: true for `npm run dev`, false for `npm run build`, whose minifier then
// removes every call below along with its arguments. Tests run without Vite, where the flag does not exist.
declare const __WRITEBETTER_DEV_LOGS__: boolean

const IS_ENABLED = typeof __WRITEBETTER_DEV_LOGS__ === 'boolean' && __WRITEBETTER_DEV_LOGS__

// Plain values only, so a DOM element, an object or a request or response body cannot be passed by mistake. Never pass
// the user's text, an API key, or anything else read from a field or a provider.
export type LogDetails = Readonly<Record<string, string | number | boolean | null>>

// Reported at the debug level (DevTools "Verbose"), to help check real sites. The details are worked out only when
// logging is on.
export const devLog = (message: string, getDetails?: () => LogDetails): void => {
  if (IS_ENABLED) console.debug(`[WriteBetter] ${message}`, getDetails?.() ?? '')
}

// Only the error's name and message: a raw error object can carry whatever data it was thrown with.
export const devError = (context: string, error: unknown): void => {
  if (IS_ENABLED) console.error(`[WriteBetter] ${context}`, error instanceof Error ? `${error.name}: ${error.message}` : typeof error)
}
