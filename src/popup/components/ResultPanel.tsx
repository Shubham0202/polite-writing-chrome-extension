import Button from '../../components/Button.tsx'
import { ACTION_LABEL, ENGINES } from '../../constants/corrections.ts'
import type { IdentifiedSuggestion, SuggestionDecisions } from '../../engines/suggestion.ts'
import { COPY_STATUS, useCopyToClipboard, type CopyStatus } from '../hooks/useCopyToClipboard.ts'
import type { PopupResult } from '../hooks/useCorrection.ts'
import EngineStatusList from './EngineStatusList.tsx'
import SuggestionItem from './SuggestionItem.tsx'

const COPY_LABEL: Record<CopyStatus, string> = {
  [COPY_STATUS.idle]: 'Copy',
  [COPY_STATUS.copied]: 'Copied',
  [COPY_STATUS.failed]: 'Copy failed',
}

interface TextBlockProps {
  label: string
  text: string
  className: string
}

const TextBlock = ({ label, text, className }: TextBlockProps) => (
  <div className="flex flex-col gap-1">
    <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-neutral-400">{label}</h3>
    <p className={`rounded-lg border p-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${className}`}>{text}</p>
  </div>
)

export interface ResultPanelProps {
  result: PopupResult
  decisions: SuggestionDecisions
  correctedText: string
  onToggleSuggestion: (id: string) => void
  onChooseReplacement: (id: string, choice: number) => void
  onReplaceInput: () => void
  onReset: () => void
}

const ResultPanel = ({ result, decisions, correctedText, onToggleSuggestion, onChooseReplacement, onReplaceInput, onReset }: ResultPanelProps) => {
  const { copyStatus, copy } = useCopyToClipboard()
  const hasChanges = correctedText !== result.original

  // An AI rewrite of the whole text is already shown in full above, so its row does not repeat both versions.
  const isWholeTextRewrite = (suggestion: IdentifiedSuggestion) =>
    suggestion.engine === ENGINES.rewrite && suggestion.offset === 0 && suggestion.length === result.original.length

  const handleCopy = () => copy(correctedText)

  return (
    <section aria-label="Result" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{ACTION_LABEL[result.action]} result</h2>
      <EngineStatusList engines={result.engines} />
      <TextBlock
        label="Original"
        text={result.original}
        className="border-slate-200 bg-white text-slate-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
      />
      <TextBlock
        label="Corrected"
        text={correctedText}
        className="border-brand-100 bg-brand-50 text-slate-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-neutral-100"
      />

      {result.suggestions.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-neutral-400">
            Changes ({result.suggestions.length}) · untick to reject
          </h3>
          <ul className="flex flex-col gap-2">
            {result.suggestions.map((suggestion) => (
              <SuggestionItem
                key={suggestion.id}
                suggestion={suggestion}
                decision={decisions[suggestion.id]}
                onToggle={onToggleSuggestion}
                onChooseReplacement={onChooseReplacement}
                isWholeTextRewrite={isWholeTextRewrite(suggestion)}
              />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-neutral-400">No changes suggested by the engines that ran.</p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleCopy}>{COPY_LABEL[copyStatus]}</Button>
        <Button variant="primary" onClick={onReplaceInput} disabled={!hasChanges}>
          Replace input
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={onReset}>
          Reset
        </Button>
      </div>
    </section>
  )
}

export default ResultPanel
