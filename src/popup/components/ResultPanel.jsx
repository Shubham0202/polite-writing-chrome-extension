import Button from '../../components/Button.jsx'
import { ACTION_LABEL, ENGINES } from '../../constants/corrections.js'
import { COPY_STATUS, useCopyToClipboard } from '../hooks/useCopyToClipboard.js'
import EngineStatusList from './EngineStatusList.jsx'
import SuggestionItem from './SuggestionItem.jsx'

const COPY_LABEL = {
  [COPY_STATUS.idle]: 'Copy',
  [COPY_STATUS.copied]: 'Copied',
  [COPY_STATUS.failed]: 'Copy failed',
}

const TextBlock = ({ label, text, className }) => (
  <div className="flex flex-col gap-1">
    <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</h3>
    <p className={`rounded-lg border p-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${className}`}>{text}</p>
  </div>
)

const ResultPanel = ({ result, decisions, correctedText, onToggleSuggestion, onChooseReplacement, onReplaceInput, onReset }) => {
  const { copyStatus, copy } = useCopyToClipboard()
  const hasChanges = correctedText !== result.original

  // An AI rewrite of the whole text is already shown in full above, so its row does not repeat both versions.
  const isWholeTextRewrite = (suggestion) =>
    suggestion.engine === ENGINES.rewrite && suggestion.offset === 0 && suggestion.length === result.original.length

  const handleCopy = () => copy(correctedText)

  return (
    <section aria-label="Result" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h2 className="text-sm font-semibold text-slate-900">{ACTION_LABEL[result.action]} result</h2>
      <EngineStatusList engines={result.engines} />
      <TextBlock label="Original" text={result.original} className="border-slate-200 bg-white text-slate-600" />
      <TextBlock label="Corrected" text={correctedText} className="border-brand-100 bg-brand-50 text-slate-900" />

      {result.suggestions.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">
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
        <p className="text-sm text-slate-600">No changes suggested by the engines that ran.</p>
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
