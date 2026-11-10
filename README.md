# WriteBetter

**A privacy-first grammar checker and writing assistant for Chrome.**

WriteBetter is a Chrome extension (Manifest V3) that fixes spelling, grammar, tense and tone while you write in Gmail, Google Chat, WhatsApp Web, LinkedIn and Jira, and turns casual messages into polite or professional ones. Every check runs on your computer and works offline. AI rewriting is optional and uses your own Gemini, Groq or OpenRouter API key, so it is a local-first alternative to Grammarly-style tools that send what you type to a server.

## Features

- **Spelling, grammar and tense checking** with a bundled English dictionary and local rules. No account, no server, works offline.
- **Make Polite, Professional and Fix Everything**: rewrite a casual or blunt message into a polite, professional one, then review every change before you replace your text.
- **Suggestions as you type** on Gmail, Google Chat, WhatsApp Web, LinkedIn and Jira: underlines, a suggestion card, Accept, Dismiss, Ignore and Undo. Works in rich-text editors, modal dialogs and shadow DOM, and you can add other sites in Settings.
- **Keyboard shortcuts**: Alt+Shift+G opens the suggestion at the cursor, and Ctrl+Shift+Space lists every suggestion in the field.
- **Optional AI rewriting** with your own Google Gemini, Groq or OpenRouter key (free OpenRouter models work), in six styles: improve wording, professional, polite, concise, friendly and clearer.
- **Optional LanguageTool** grammar checks, from a server on your computer or, if you turn it on, LanguageTool's public API.
- **Private by default**: your text is never stored, and nothing leaves your computer unless you turn on the online grammar check or AI rewriting.

To install it, build it from source and load it in Chrome: see [Setup](#setup) and [Load the extension in Chrome](#load-the-extension-in-chrome).

## Status

| Area | Status |
|------|--------|
| Extension setup, popup ↔ service worker messaging | Done |
| Popup: Fix Grammar, Make Polite, Professional, Fix Everything, result review, Copy / Replace input / Undo / Reset | Done |
| Engines: spelling (nspell), grammar (LanguageTool + local rules), tense rules, polite and professional tone, result validation | Done |
| Settings page (suggestion checks, delay, websites, ignored words, privacy summary) | Done |
| Choosing the LanguageTool server address | Planned |
| Optional online grammar check in the popup (off by default) | Done |
| Inline assistance on websites, phases 1–7 of 8: detects the editable field you are typing in on supported sites, checks its text with the local engines once you pause typing, shows underlines, a suggestion card and a badge on the page, lets you accept, dismiss, ignore and undo, handles rich-text editors, modal dialogs and shadow DOM, and has settings and pause controls | Done |
| Inline assistance, phase 8: final testing and optimization | Planned |
| Rewrite with AI in the popup: Gemini, Groq or OpenRouter with your own API key, six styles, preview, accept or reject, Replace input, Undo | Done |
| Rewrite with AI from Ctrl+Shift+Space on websites: optional switch in the suggestion list and in Settings, loader, result listed with the other suggestions | Done |

## Requirements

- Node.js 20+ and npm
- Google Chrome 116+
- Optional: Java 17+ to run a local LanguageTool server

## Setup

```bash
npm install
npm run build      # one-off production build into dist/
npm run dev        # rebuilds dist/ on every file change
npm test           # unit tests for every engine and the pipeline (Node's built-in test runner, with tsx for TypeScript)
npm run lint
npm run typecheck  # TypeScript, strict; JavaScript files still being converted are not checked
```

`dist/` and `node_modules/` are not committed (see `.gitignore`), so after cloning, run `npm install` and `npm run build` before loading the extension. Run `npm test`, `npm run lint` and `npm run typecheck` before committing.

## Load the extension in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. Pin WriteBetter and click its icon. The header shows **Ready** when the popup can reach the background service worker.

While `npm run dev` is running, click the reload icon on the extension card after each rebuild. Tabs already open on a supported site pick up the new version without being refreshed.

## Optional: local LanguageTool server

Without it, grammar is checked by the built-in local rules and the result says that LanguageTool was unavailable. With it, LanguageTool adds broader grammar and punctuation checks, and your text still never leaves your computer.

1. Download and unzip LanguageTool from https://languagetool.org/download/LanguageTool-stable.zip
2. In the unzipped folder, run:
   ```bash
   java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081
   ```
3. Run a correction again. The result's engine list shows **Grammar (LanguageTool) ran**.

The extension calls `http://localhost:8081/v2/check`; this address cannot be changed yet.

## Optional: online grammar check

To use LanguageTool without installing anything, turn on **Online grammar check** in the popup. It is off by default.

- When it is on, **Fix Grammar** and **Fix Everything** send your text to [LanguageTool](https://languagetool.org)'s free public API (`https://api.languagetool.org/v2/check`) instead of the local server. Your text and IP address go to LanguageTool's servers; see their [privacy policy](https://languagetool.org/legal/privacy).
- **Make Polite** and **Professional** never use it.
- Checks as you type on websites never use it, whether the switch is on or off. LanguageTool's terms do not allow automated requests to the public API, and those checks would otherwise send what you type on every site.
- The API allows 20 requests a minute at peak, 75 KB a minute and 20 KB per request. It comes with no availability guarantee, and the limits can change. If it cannot be reached, grammar is checked with the local rules and the result says so.

## Optional: AI rewriting

The local engines fix mistakes but keep your wording. **Rewrite with AI** goes further: it rewrites the text in the popup so that it reads naturally and politely while still saying the same thing. It needs an API key from one of these providers, added once in Settings:

| Provider | Default model | Where to create a key |
|----------|---------------|-----------------------|
| Google Gemini | `gemini-3.6-flash` | https://aistudio.google.com/apikey |
| Groq | `openai/gpt-oss-120b` | https://console.groq.com/keys |
| OpenRouter | `liquid/lfm-3-1.7b:free` | https://openrouter.ai/workspaces/default/keys |

### Recommended for a free key: OpenRouter

To try AI rewriting without paying, use OpenRouter. Create a key at **https://openrouter.ai/workspaces/default/keys** and use a model whose name ends in `:free`. Those models cost nothing. OpenRouter only serves them to accounts whose privacy settings allow free models, and it limits how often they can be called, so a request can occasionally be refused when you send many in a row.

These free models work with WriteBetter. All of them were listed as free on OpenRouter, with JSON output support, on 2026-11-08:

| Model | Name on OpenRouter | Context |
|-------|--------------------|---------|
| `liquid/lfm-3-1.7b:free` | LiquidAI LFM3-1.7B. The default: the smallest and fastest | 262K |
| `google/gemma-4-31b-it:free` | Google Gemma 4 31B | 262K |
| `google/gemma-4-26b-a4b-it:free` | Google Gemma 4 26B A4B | 262K |
| `nvidia/nemotron-3.5-super-vl:free` | NVIDIA Nemotron 3.5 Super VL | 1M |
| `xingchen-agi/xing4.0-29b-a4b:free` | XingChen Xing4.0 29B A4B | 262K |
| `dots-studio/dots-3-note-preview:free` | Dots Studio Dots3-Note Preview | 512K |
| `recursive/flint-v1.0:free` | Recursive Flint | 262K |
| `liquid/lfm-2.5-2.6b:free` | LiquidAI LFM2.5-2.6B | 65K |

The default model is the quickest. If its rewrites are too plain, try a larger model such as `google/gemma-4-31b-it:free`. Clicking the model field in Settings offers this same list. Free models come and go: browse the current ones at https://openrouter.ai/models?max_price=0. Any other model works too, as long as it supports JSON output.

1. Open **Settings → AI rewriting**, choose the provider, paste the key and press **Save**. Leave the model empty to use the default, or type another model name there. For OpenRouter, clicking the field suggests free models that can rewrite.
2. In the popup, pick a style next to **Rewrite with AI** (Improve wording, Make professional, Make polite, Make concise, Make friendly or Improve clarity) and press the button. While there is no key, the button's neighbour says **Set up** and opens Settings.
3. Review the result like any correction: the original and the rewrite side by side, each change ticked or unticked, then **Copy** or **Replace input** (with **Undo**). Nothing changes until you choose to replace.

What is sent, and when: only the text in the popup and the chosen style, only when you press the button, straight from the extension to the provider over HTTPS. With **Rewrite with AI from the keyboard shortcut** turned on in Settings, pressing Ctrl+Shift+Space in a field on a website also sends that field's text, in the style chosen there. Checks as you type and the other popup buttons never use it, and no extra Chrome permission is involved. The key is kept in Chrome's extension storage on this computer, is only ever sent to the provider you chose, and **Remove key** deletes it. Read the provider's terms and privacy policy before sending work messages to it.

Every rewrite is checked before it is shown: it is not used if it changed or added a link, email address, @mention or code, or if it grew out of proportion, and a rewrite that only changes spacing counts as no change. Multi-sentence texts are offered sentence by sentence when the sentences still correspond, otherwise as one change. Requests give up after 30 seconds, **Cancel** stops one early, and closing the popup cancels it too. If the provider rejects the key or the model, the message in the popup says which one to check. Texts are limited to 5,000 characters, like every other correction.

## What works offline

| Feature | Offline | Notes |
|---------|---------|-------|
| Spelling | Yes | English dictionary is bundled; British spellings and accented words are accepted; long texts are checked within a 1.5 s budget |
| Local grammar and punctuation rules | Yes | Agreement, capitalization, question marks, spacing, repeated words, a/an |
| Tense rules | Yes | Only verbs in `src/engines/tense/verbLexicon.js` are corrected |
| Polite and professional tone | Yes | Rule-based phrase and sentence transformations |
| LanguageTool grammar | Yes, once installed locally | Needs the Java server above; nothing is sent to the internet |
| LanguageTool grammar, online | No | Only when you turn on **Online grammar check** in the popup |
| AI rewriting | No | Only when you press **Rewrite with AI** in the popup, after adding your own API key in Settings |

## How a correction runs

1. The popup validates the text (not empty, at most 5,000 characters) and sends it to the service worker.
2. `src/services/correctionPipeline.js` runs the engines for the chosen button. Each engine is a plain function that returns suggestions against the original text: offset, original, replacements, category, explanation, source and confidence.
3. Where suggestions overlap, targeted local rules win over LanguageTool, and LanguageTool wins over the dictionary. For **Fix Everything**, each sentence is corrected first and then rewritten in the chosen tone; the tone rewrite lists the corrections it includes.
4. `src/services/resultValidator.js` drops suggestions that no longer match the text, touch URLs, emails, @mentions or `inline code`, would duplicate words or phrases, or would double punctuation ("??").
5. The popup shows the original, the corrected text and every change. High-confidence changes start ticked; uncertain ones (for example LanguageTool style hints) start unticked. Nothing changes the input until the user clicks **Replace input**, which can be undone.

If an engine is unavailable or fails, the others still run and the result says which engine did not.

## How a check on a website runs

1. The content script finds the supported field that has focus and waits until you stop typing for 1 second.
2. It sends the text to the service worker, which runs the same engines as the popup. Only the local LanguageTool server is used, never the online service. If that server fails, it is left alone for a minute.
3. A check is cancelled as soon as the text changes or you leave the field, so results for outdated text are never used.

4. Mistakes are underlined under the words themselves: a solid red line for spelling, dashed amber for grammar, dashed blue for tense, and dotted for uncertain suggestions. Underlines stay on their words as you type.
5. Hover a word, or move the caret into it, to open the suggestion card above the word (under it only when there is no room above). The badge in the corner of the field counts the suggestions and steps through them, including rewrites of sentences that have no mistake.
6. **Accept** replaces only that text, and the field checks the result before saying it worked. If the text changed in the meantime, or the site rejects the change, nothing is altered and you are told. Text is never changed without a click.
7. **Undo** in the message that follows, or Ctrl+Z, puts the text back.
8. **Dismiss** hides a suggestion in that field until the page is reloaded. **Ignore** adds a spelling word to your personal dictionary, which the popup also uses.

Keyboard users can press **Alt+Shift+G** to open the suggestion at the cursor, or **Ctrl+Shift+Space** to list every suggestion in the field at once, above it, each with its own Accept and Dismiss. The list stays open while you work through it, and the same key puts it away. Tab moves through the card, and Esc returns to the field with the cursor where it was. In the list, AI rewrites come first and the cursor starts on the first one's **Accept**, so Enter accepts it. Accepting an AI rewrite closes the list. Other suggestions keep it open, and the cursor moves to the Accept of the next one, unless **Close after Accept** is on in the list's header or in Settings; then every Accept closes the list. Up and Down, or Page Up and Page Down, move between suggestions and land on Accept, and Left and Right move to Dismiss (and Ignore) and back. The shortcuts can be changed at `chrome://extensions/shortcuts`; Settings shows the key Chrome has for each and opens that page. Chrome keeps shortcuts per profile and leaves one unset when another extension in that profile already has its key. WriteBetter then still answers the default key on websites, unless another extension takes that key first.

The list also has a **Rewrite with AI** switch, off by default and the same as the one in Settings. While it is on, Ctrl+Shift+Space also sends the field's text to your AI provider, shows a loader in the list, and then adds the rewrite as items of their own, one per sentence where the sentences can be matched up and otherwise one for the whole text, each with Accept and Dismiss. Turning the switch on while the list is open starts a rewrite straight away. Opening the list again for the same text, in the same style, shows the earlier AI rewrite without a new request; accepting its suggestions or undoing them still counts as the same text, while typing does not. The AI row then has a **Regenerate** button to ask the AI again for the same text. Typing, closing the list or leaving the field cancels a rewrite that is still running. In rich-text editors a whole-text rewrite replaces the formatting of that text too, so per-sentence items are preferred whenever possible.

Your text is never stored. Only your settings, your ignored words and, if you add one, your AI API key are saved. The small content script runs on supported sites, and the suggestion UI (`inlineUi.js`) is only injected once there is something to show. It lives in a closed Shadow DOM, so sites cannot restyle it or read the text in it.

## Settings

Open **Settings** from the popup, or from the extension's menu.

| Setting | What it does |
|---------|--------------|
| Show suggestions on websites | Turns everything off or on, at once and without a reload. The popup has the same switch. While off, pages have no field listeners at all |
| Spelling, Grammar and tense, Polite rewrites, Professional rewrites | Choose what the checks on websites look for. The popup buttons always run every check, because pressing one is an explicit request |
| Delay | How long to wait after you stop typing, from 0.5 to 3 seconds. The default is 1 second |
| Close the suggestion list after Accept | Off by default. Accepting an AI rewrite always closes the Ctrl+Shift+Space list; with this on, accepting any suggestion does too. The list has the same switch |
| Keyboard shortcuts | The key Chrome has for each shortcut in this profile, a warning when one is not set, and **Change shortcuts**, which opens `chrome://extensions/shortcuts` |
| Websites | Turn a site off to pause it there, or add one. Chrome asks for access to that site only, and removing the site gives that access back |
| Ignored words | The personal dictionary. Words can be removed here |
| AI rewriting | The provider, API key and model that **Rewrite with AI** uses, and whether Ctrl+Shift+Space rewrites with AI on websites and in which style. Optional; the key stays on this computer and **Remove key** deletes it |

The popup can also pause the site you are on. Chat inside Gmail follows the Gmail switch; the Google Chat switch is for `chat.google.com` itself. Settings are saved in Chrome's local extension storage, on this computer.

## Website compatibility

| Tested | How |
|--------|-----|
| Inputs, textareas, contenteditable, fields inside shadow DOM, modal dialogs, popovers and iframes | Automated, in Chrome |
| Lexical, ProseMirror and Quill | Automated, against the real libraries, checking that each editor's own document receives the change |
| Gmail's reply layout | Automated, on a copy of its structure: quoted messages and signatures are not checked or changed |
| Gmail, Google Chat, WhatsApp Web, LinkedIn and Jira themselves | Not yet: these need a signed-in browser |

Most sites need nothing special, so `src/content/siteAdapters.js` only holds what generic handling cannot work out. Fields inside closed shadow roots cannot be reached, and Google Docs draws its text on a canvas, so neither is supported. In an iframe shorter than the suggestion card, the card is cut off at the iframe's edge.

## Project structure

```
public/manifest.json            Manifest V3 definition
public/icons/                   Extension icons (16, 32, 48, 128 px)
popup.html                      Popup page entry
options.html                    Settings page entry
vite.config.js                  Build: popup, settings page and service worker, plus content.js and inlineUi.js bundled
                                as single files with size budgets
eslint.config.js                Lint rules for browser and extension code
dist/                           Build output loaded into Chrome (generated, not committed)
src/
  background/serviceWorker.js   Message router; runs the correction pipeline
  content/                      Content script for inline assistance: field detection and reading, change detection, checking, and the suggestion UI
    ui/                         Vanilla DOM for the underlines, card and badge (no React in web pages)
  components/                   Shared button, select and switch
  constants/                    Actions, tones, engines, categories, limits, labels, default settings, built-in sites, AI providers and rewriting styles
  engines/
    suggestion.js               Suggestion model shared by all engines and the popup
    spelling/                   nspell checker, bundled dictionary, common misspellings
    grammar/                    LanguageTool client and local grammar rules
    tense/                      Verb lexicon, tense rules (each with examples) and runner
    tone/                       Polite and professional rules and the tone rewriter
    rewrite/                    AI rewriting: the prompt, the provider clients (Gemini, Groq, OpenRouter) and the rewrite suggestions
  fixtures/sentences.js         Correct sentences no engine may change (used by tests)
  hooks/                        Hooks shared by the popup and the settings page
  options/                      Settings page: components and hooks
  popup/                        Popup UI: components and hooks
  services/                     Correction pipeline, writing enhancer (AI rewriting), latest-request runner, settings, AI settings, ignored words, result validator, messaging
  styles/                       Tailwind import and the brand colour tokens shared with the inline UI
  utils/                        Text, diff, validation and error helpers
```

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Remembers your settings, the Online grammar check switch, the words you chose to ignore and, if you add one, your AI API key |
| `scripting` | Injects the suggestion UI into a page the first time there is something to show, and registers sites you add |
| `http://localhost/*`, `http://127.0.0.1/*` | Lets the service worker reach a LanguageTool server running on this computer |
| Optional: access to any website (`*://*/*`) | Declared as optional, so nothing is granted at install. Adding a site in Settings asks Chrome for that one site |
| `mail.google.com`, `chat.google.com`, `web.whatsapp.com`, `www.linkedin.com`, `*.atlassian.net` | Runs the content script there and injects the suggestion UI. Password, payment, one-time-code, read-only and code-editor fields are never watched |

## Author

Shubham Chandgude ([shubham826852@gmail.com](mailto:shubham826852@gmail.com))

## License

MIT License

Copyright (c) 2026 Shubham Chandgude

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
