import { lookup } from '../utils/lookup.js'

// Only for what generic DOM handling cannot work out by itself. Quoted messages and signatures sit inside Gmail's
// editor, but they are not what the user is writing, and sending them to the engines would only waste the text limit.
// On Google's mail and chat editors, spellcheck="false" only concerns the browser's spell checker; it is not a request
// to keep writing assistants out, which the plain inputs around them (such as search) still get.
const SITE_ADAPTERS = {
  'mail.google.com': { excludedSelector: '.gmail_quote, .gmail_signature, .gmail_signature_prefix', checksRichTextWithSpellcheckOff: true },
  'chat.google.com': { checksRichTextWithSpellcheckOff: true },
}

export const getSiteAdapter = (hostname) => lookup(SITE_ADAPTERS, hostname) ?? {}

// A frame follows the site it is on, and about:blank frames have no hostname of their own.
export const getPageHostname = () => {
  const { ancestorOrigins, hostname } = location
  return ancestorOrigins.length ? new URL(ancestorOrigins[ancestorOrigins.length - 1]).hostname : hostname
}
