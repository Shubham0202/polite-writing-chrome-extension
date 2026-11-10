import type { ChangeEvent } from 'react'
import { CATEGORY_LABEL, CONFIDENCE, ENGINES, SOURCE_LABEL, type Engine } from '../../constants/corrections.ts'
import { formatSnippet, type IdentifiedSuggestion, type SuggestionDecision } from '../../engines/suggestion.ts'

const ENGINE_BADGE_CLASS: Record<Engine, string> = {
  [ENGINES.spelling]: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  [ENGINES.grammar]: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  [ENGINES.tense]: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  [ENGINES.tone]: 'bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
  [ENGINES.rewrite]: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30',
}

interface ReplacementProps {
  replacement: string
}

const Replacement = ({ replacement }: ReplacementProps) =>
  replacement ? (
    <ins className="font-medium text-emerald-700 no-underline dark:text-emerald-300">{formatSnippet(replacement)}</ins>
  ) : (
    <span className="text-slate-500 dark:text-neutral-400">remove</span>
  )

// The Original and Corrected blocks already show both versions of a whole-text rewrite, so its row only repeats the
// rewrite while it is unticked, when the Corrected block no longer shows it.
interface WholeTextChangeProps {
  replacement: string
  isAccepted: boolean
}

const WholeTextChange = ({ replacement, isAccepted }: WholeTextChangeProps) =>
  isAccepted ? (
    <p className="text-sm text-slate-600 dark:text-neutral-400">Whole text rewritten. Compare it above.</p>
  ) : (
    <p className="text-sm break-words whitespace-pre-wrap">
      <Replacement replacement={replacement} />
    </p>
  )

interface ChangeProps {
  original: string
  replacement: string
}

const Change = ({ original, replacement }: ChangeProps) => (
  <p className="text-sm break-words">
    {original ? (
      <del className="text-rose-700 decoration-rose-400 dark:text-rose-300">{formatSnippet(original)}</del>
    ) : (
      <span className="text-slate-500 dark:text-neutral-400">Add</span>
    )}
    <span className="mx-1 text-slate-400 dark:text-neutral-500" aria-hidden="true">
      →
    </span>
    <Replacement replacement={replacement} />
  </p>
)

export interface SuggestionItemProps {
  suggestion: IdentifiedSuggestion
  decision: SuggestionDecision | undefined
  onToggle: (id: string) => void
  onChooseReplacement: (id: string, choice: number) => void
  isWholeTextRewrite?: boolean
}

const SuggestionItem = ({ suggestion, decision, onToggle, onChooseReplacement, isWholeTextRewrite = false }: SuggestionItemProps) => {
  const checkboxId = `suggestion-${suggestion.id}`
  const choice = decision?.choice ?? 0
  const replacement = suggestion.replacements[choice] ?? suggestion.replacements[0]

  const handleToggle = () => onToggle(suggestion.id)
  const handleChoose = (event: ChangeEvent<HTMLSelectElement>) => onChooseReplacement(suggestion.id, Number(event.target.value))

  return (
    <li className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <input
        id={checkboxId}
        type="checkbox"
        checked={Boolean(decision?.accepted)}
        onChange={handleToggle}
        className="mt-0.5 size-4 shrink-0 accent-brand-600"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${ENGINE_BADGE_CLASS[suggestion.engine]}`}>
            {CATEGORY_LABEL[suggestion.category]}
          </span>
          <span className="text-slate-500 dark:text-neutral-400">{SOURCE_LABEL[suggestion.source]}</span>
          {suggestion.confidence === CONFIDENCE.low && <span className="text-amber-700 dark:text-amber-300">Uncertain · not applied automatically</span>}
        </div>
        {isWholeTextRewrite ? (
          <WholeTextChange replacement={replacement} isAccepted={Boolean(decision?.accepted)} />
        ) : (
          <Change original={suggestion.original} replacement={replacement} />
        )}
        {suggestion.replacements.length > 1 && (
          <select
            aria-label="Choose a replacement"
            value={choice}
            onChange={handleChoose}
            className="w-fit rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
          >
            {suggestion.replacements.map((option, index) => (
              <option key={option} value={index}>
                {option}
              </option>
            ))}
          </select>
        )}
        <label htmlFor={checkboxId} className="text-xs text-slate-600 dark:text-neutral-400">
          {suggestion.explanation}
        </label>
        {suggestion.includedCorrections.length > 0 && (
          <ul className="list-disc pl-4 text-xs text-slate-500 dark:text-neutral-400" aria-label="Corrections included in this rewrite">
            {suggestion.includedCorrections.map((correction) => (
              <li key={correction.explanation}>
                {CATEGORY_LABEL[correction.category]}: {correction.explanation}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export default SuggestionItem
