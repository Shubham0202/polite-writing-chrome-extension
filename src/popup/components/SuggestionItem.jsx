import { CATEGORY_LABEL, CONFIDENCE, ENGINES, SOURCE_LABEL } from '../../constants/corrections.js'
import { formatSnippet } from '../../engines/suggestion.js'

const ENGINE_BADGE_CLASS = {
  [ENGINES.spelling]: 'bg-rose-50 text-rose-700 ring-rose-200',
  [ENGINES.grammar]: 'bg-amber-50 text-amber-800 ring-amber-200',
  [ENGINES.tense]: 'bg-sky-50 text-sky-700 ring-sky-200',
  [ENGINES.tone]: 'bg-brand-50 text-brand-700 ring-brand-100',
  [ENGINES.rewrite]: 'bg-violet-50 text-violet-700 ring-violet-200',
}

const Replacement = ({ replacement }) =>
  replacement ? (
    <ins className="font-medium text-emerald-700 no-underline">{formatSnippet(replacement)}</ins>
  ) : (
    <span className="text-slate-500">remove</span>
  )

// The Original and Corrected blocks already show both versions of a whole-text rewrite, so its row only repeats the
// rewrite while it is unticked, when the Corrected block no longer shows it.
const WholeTextChange = ({ replacement, isAccepted }) =>
  isAccepted ? (
    <p className="text-sm text-slate-600">Whole text rewritten. Compare it above.</p>
  ) : (
    <p className="text-sm break-words whitespace-pre-wrap">
      <Replacement replacement={replacement} />
    </p>
  )

const Change = ({ original, replacement }) => (
  <p className="text-sm break-words">
    {original ? <del className="text-rose-700 decoration-rose-400">{formatSnippet(original)}</del> : <span className="text-slate-500">Add</span>}
    <span className="mx-1 text-slate-400" aria-hidden="true">
      →
    </span>
    <Replacement replacement={replacement} />
  </p>
)

const SuggestionItem = ({ suggestion, decision, onToggle, onChooseReplacement, isWholeTextRewrite = false }) => {
  const checkboxId = `suggestion-${suggestion.id}`
  const choice = decision?.choice ?? 0
  const replacement = suggestion.replacements[choice] ?? suggestion.replacements[0]

  const handleToggle = () => onToggle(suggestion.id)
  const handleChoose = (event) => onChooseReplacement(suggestion.id, Number(event.target.value))

  return (
    <li className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
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
          <span className="text-slate-500">{SOURCE_LABEL[suggestion.source]}</span>
          {suggestion.confidence === CONFIDENCE.low && <span className="text-amber-700">Uncertain · not applied automatically</span>}
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
            className="w-fit rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {suggestion.replacements.map((option, index) => (
              <option key={option} value={index}>
                {option}
              </option>
            ))}
          </select>
        )}
        <label htmlFor={checkboxId} className="text-xs text-slate-600">
          {suggestion.explanation}
        </label>
        {suggestion.includedCorrections.length > 0 && (
          <ul className="list-disc pl-4 text-xs text-slate-500" aria-label="Corrections included in this rewrite">
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
