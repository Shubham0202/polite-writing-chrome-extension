// Bundled at build time (see the dictionary-en alias in vite.config.js), so spelling works fully offline.
import aff from 'dictionary-en/index.aff?raw'
import dic from 'dictionary-en/index.dic?raw'

export const EN_DICTIONARY = { aff, dic }
