import { useState, type ChangeEvent } from 'react'
import Button from '../components/Button.tsx'
import { REWRITE_STYLES, type RewriteStyle } from '../constants/ai.ts'
import { TONES, type CorrectionAction, type Tone } from '../constants/corrections.ts'
import { useSettings } from '../hooks/useSettings.ts'
import CorrectionActions from './components/CorrectionActions.tsx'
import InlineControls from './components/InlineControls.tsx'
import OnlineGrammarSwitch from './components/OnlineGrammarSwitch.tsx'
import PopupHeader from './components/PopupHeader.tsx'
import ResultPanel from './components/ResultPanel.tsx'
import TextInput from './components/TextInput.tsx'
import { useActiveHostname } from './hooks/useActiveHostname.ts'
import { useBackgroundStatus } from './hooks/useBackgroundStatus.ts'
import { useCorrection } from './hooks/useCorrection.ts'
import { stashDraft, useRestoredDraft } from './hooks/useDraft.ts'
import { useOnlineGrammar } from './hooks/useOnlineGrammar.ts'

// A stable callback ref, so the alert is scrolled into view once when it appears, not on every re-render.
const revealAlert = (node: HTMLParagraphElement | null) => node?.scrollIntoView({ block: 'nearest' })

const Popup = () => {
  const { status, version, isAiConfigured } = useBackgroundStatus()
  const correction = useCorrection()
  const onlineGrammar = useOnlineGrammar()
  const { settings, updateSettings } = useSettings()
  const hostname = useActiveHostname()
  const [text, setText] = useState('')
  const [textBeforeReplace, setTextBeforeReplace] = useState<string | null>(null)
  useRestoredDraft(setText)
  const [tone, setTone] = useState<Tone>(TONES.polite)
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>(REWRITE_STYLES.improveWording)

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value)
    setTextBeforeReplace(null)
    // The result describes the old text, so any edit makes it stale.
    if (correction.result || correction.error) correction.clearResult()
  }

  const handleRun = (action: CorrectionAction) => correction.runCorrection({ action, text, tone, isOnlineGrammarEnabled: onlineGrammar.isEnabled })
  const handleRewrite = () => correction.runRewrite({ text, style: rewriteStyle })

  // Settings open in a tab, which closes the popup; the text typed so far is kept for the next opening.
  const handleOpenSettings = () => {
    if (text.trim()) stashDraft(text)
    chrome.runtime.openOptionsPage()
  }

  const handleReplaceInput = () => {
    setTextBeforeReplace(text)
    setText(correction.correctedText)
    correction.clearResult()
  }

  const handleUndoReplace = () => {
    setText(textBeforeReplace!)
    setTextBeforeReplace(null)
  }

  return (
    <main className="w-110 bg-white font-sans text-slate-900">
      <PopupHeader status={status} version={version} />
      <div className="flex flex-col gap-3 px-4 py-3">
        <TextInput value={text} onChange={handleTextChange} isReadOnly={Boolean(correction.pendingAction)} />
        {textBeforeReplace !== null && (
          <div role="status" className="-mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
            Input replaced with the corrected text.
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={handleUndoReplace} disabled={Boolean(correction.pendingAction)}>
              Undo
            </Button>
          </div>
        )}
        <CorrectionActions
          pendingAction={correction.pendingAction}
          tone={tone}
          onToneChange={setTone}
          onRun={handleRun}
          isAiConfigured={isAiConfigured}
          rewriteStyle={rewriteStyle}
          onRewriteStyleChange={setRewriteStyle}
          onRewrite={handleRewrite}
          onCancelRewrite={correction.cancelRewrite}
          onOpenSettings={handleOpenSettings}
        />
        <OnlineGrammarSwitch
          isEnabled={onlineGrammar.isEnabled}
          isDisabled={Boolean(correction.pendingAction)}
          onChange={onlineGrammar.setIsEnabled}
        />
        {settings && <InlineControls settings={settings} hostname={hostname} onUpdate={updateSettings} onOpenSettings={handleOpenSettings} />}
        {correction.error && (
          <p ref={revealAlert} role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {correction.error}
          </p>
        )}
        {correction.result && (
          <ResultPanel
            result={correction.result}
            decisions={correction.decisions}
            correctedText={correction.correctedText}
            onToggleSuggestion={correction.toggleSuggestion}
            onChooseReplacement={correction.chooseReplacement}
            onReplaceInput={handleReplaceInput}
            onReset={correction.clearResult}
          />
        )}
      </div>
    </main>
  )
}

export default Popup
