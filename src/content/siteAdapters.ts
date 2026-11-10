import { matchesSite } from '../utils/siteMatch.ts'

export interface SiteAdapter {
  excludedSelector?: string
  checksRichTextWithSpellcheckOff?: boolean
  checksRichTextWithAssistantsOff?: boolean
}

// Only for what generic DOM handling cannot work out by itself. Quoted messages and signatures sit inside Gmail's
// editor, but they are not what the user is writing, and sending them to the engines would only waste the text limit.
// On Google's mail and chat editors, spellcheck="false" only concerns the browser's spell checker; it is not a request
// to keep writing assistants out, which the plain inputs around them (such as search) still get.
// Atlassian's editor (Jira, Confluence) puts data-gramm="false" on every editor, because Grammarly rewriting its DOM
// breaks ProseMirror. Accepting a suggestion here goes through the editor's own input handling instead, and without
// this Jira would never be checked at all.
const SITE_ADAPTERS: Record<string, SiteAdapter> = {
  'mail.google.com': { excludedSelector: '.gmail_quote, .gmail_signature, .gmail_signature_prefix', checksRichTextWithSpellcheckOff: true },
  'chat.google.com': { checksRichTextWithSpellcheckOff: true },
  '*.atlassian.net': { checksRichTextWithAssistantsOff: true },
}

export const getSiteAdapter = (hostname: string = ''): SiteAdapter =>
  Object.entries(SITE_ADAPTERS).find(([site]) => matchesSite(site, hostname))?.[1] ?? {}

// A frame follows the site it is on, and about:blank frames have no hostname of their own.
export const getPageHostname = (): string => {
  const { ancestorOrigins, hostname } = location
  if (!ancestorOrigins.length) return hostname
  try {
    return new URL(ancestorOrigins[ancestorOrigins.length - 1]).hostname
  } catch {
    // A sandboxed or data: top page has an opaque origin, listed as "null"; it matches no site, so checks stay off.
    return ''
  }
}
