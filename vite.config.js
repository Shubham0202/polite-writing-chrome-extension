import { Buffer } from 'node:buffer'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build, defineConfig } from 'vite'

// manifest.json points at these entries by fixed paths, so they must not be hashed.
const FIXED_NAME_ENTRIES = new Set(['serviceWorker'])
// These run inside web pages, so they have size budgets. content.js loads on every supported page; inlineUi.js only
// when there is something to show. Going over usually means an engine was imported by mistake.
const PAGE_SCRIPTS = [
  { entry: 'src/content/main.ts', fileName: 'content.js', budgetBytes: 13_500 },
  { entry: 'src/content/inlineUi.ts', fileName: 'inlineUi.js', budgetBytes: 38_000 },
]

// Development logging (src/utils/devLog.ts) is compiled in only by `npm run dev`. Any other build replaces the flag with
// false and marks the functions pure, so the bundler drops every call, arguments included. Development builds must not
// mark them pure, or their calls would be dropped there too.
const isDevelopment = (mode) => mode === 'development'
const defineDevLogs = (mode) => ({ __WRITEBETTER_DEV_LOGS__: JSON.stringify(isDevelopment(mode)) })
const devLogTreeshake = (mode) => (isDevelopment(mode) ? true : { manualPureFunctions: ['devLog', 'devError'] })
// The page scripts run inside websites, so a release build must not print anything there. Only calls count: an address
// such as console.groq.com is not one.
const CONSOLE_CALL_PATTERN = /\bconsole\.[a-z]+\(/
// The service worker closes storage to content scripts, because it holds the AI keys; a page script using it would fail.
const STORAGE_PATTERN = /\bchrome\.storage\b/
// The budgets are for what users get. A development build also carries the logging, so it gets this much more; an engine
// imported by mistake is tens of kilobytes and still fails both.
const DEV_LOG_ALLOWANCE_BYTES = 2_000

// Scripts in pages load as classic scripts and cannot import shared chunks, so each one is bundled on its own into a
// single file. They are built inside this build rather than by a second watcher, because every rebuild here empties
// dist/ and would delete the other watcher's output.
const pageScripts = (mode) => {
  const bundles = new Map()

  return {
    name: 'writebetter-page-scripts',
    async buildStart() {
      for (const { entry, fileName } of PAGE_SCRIPTS) {
        const [{ output }] = [
          await build({
            configFile: false,
            mode,
            define: defineDevLogs(mode),
            logLevel: 'warn',
            plugins: [tailwindcss()],
            build: {
              write: false,
              lib: { entry: resolve(import.meta.dirname, entry), formats: ['iife'], name: 'writeBetter' },
              rolldownOptions: { treeshake: devLogTreeshake(mode) },
            },
          }),
        ].flat()
        bundles.set(fileName, output[0].code)
        output[0].moduleIds.filter((id) => !id.startsWith('\0')).forEach((id) => this.addWatchFile(id.split('?')[0]))
      }
    },
    generateBundle() {
      for (const { fileName, budgetBytes } of PAGE_SCRIPTS) {
        const source = bundles.get(fileName)
        const size = Buffer.byteLength(source)
        const budget = isDevelopment(mode) ? budgetBytes + DEV_LOG_ALLOWANCE_BYTES : budgetBytes
        if (size > budget) this.error(`${fileName} is ${size} bytes, over its budget of ${budget} bytes.`)
        if (!isDevelopment(mode) && CONSOLE_CALL_PATTERN.test(source)) this.error(`${fileName} still calls console in a release build.`)
        if (STORAGE_PATTERN.test(source)) this.error(`${fileName} uses chrome.storage, which content scripts cannot reach. Send a message to the service worker instead.`)
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  define: defineDevLogs(mode),
  plugins: [react(), tailwindcss(), pageScripts(mode)],
  resolve: {
    alias: [
      // dictionary-en only exports a Node entry (it reads its files with fs), so the raw word lists are imported directly.
      {
        find: /^dictionary-en\/(index\.(?:aff|dic))/,
        replacement: resolve(import.meta.dirname, 'node_modules/dictionary-en/$1'),
      },
    ],
  },
  build: {
    // The service worker bundles the ~550 kB English dictionary, and MV3 service workers cannot lazy-load with import().
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      treeshake: devLogTreeshake(mode),
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        options: resolve(import.meta.dirname, 'options.html'),
        serviceWorker: resolve(import.meta.dirname, 'src/background/serviceWorker.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          FIXED_NAME_ENTRIES.has(chunk.name) ? '[name].js' : 'assets/[name]-[hash].js',
      },
    },
  },
}))
