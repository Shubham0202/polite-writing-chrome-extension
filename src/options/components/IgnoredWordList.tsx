import Button from '../../components/Button.tsx'
import { removeIgnoredWord } from '../../services/ignoredWords.ts'

interface IgnoredWordListProps {
  words: string[]
}

const IgnoredWordList = ({ words }: IgnoredWordListProps) =>
  words.length ? (
    <ul className="flex flex-wrap gap-2">
      {words.map((word) => (
        <li key={word} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-3 text-sm text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          {word}
          <Button variant="ghost" className="rounded-full px-2 py-1 text-xs" aria-label={`Stop ignoring ${word}`} onClick={() => removeIgnoredWord(word)}>
            Remove
          </Button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-slate-500 dark:text-neutral-400">No ignored words yet. Choose Ignore on a spelling suggestion to add one.</p>
  )

export default IgnoredWordList
