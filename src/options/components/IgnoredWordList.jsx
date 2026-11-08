import Button from '../../components/Button.jsx'
import { removeIgnoredWord } from '../../services/ignoredWords.js'

const IgnoredWordList = ({ words }) =>
  words.length ? (
    <ul className="flex flex-wrap gap-2">
      {words.map((word) => (
        <li key={word} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-3 text-sm text-slate-700">
          {word}
          <Button variant="ghost" className="rounded-full px-2 py-1 text-xs" aria-label={`Stop ignoring ${word}`} onClick={() => removeIgnoredWord(word)}>
            Remove
          </Button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-slate-500">No ignored words yet. Choose Ignore on a spelling suggestion to add one.</p>
  )

export default IgnoredWordList
