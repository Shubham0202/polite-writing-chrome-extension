import Button from '../../components/Button.tsx'

interface ShortcutListProps {
  shortcuts: chrome.commands.Command[]
}

// Extensions can read their shortcuts but not set them; only this Chrome page can.
const openShortcutSettings = () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(() => {})
}

const ShortcutList = ({ shortcuts }: ShortcutListProps) => {
  const hasUnsetShortcut = shortcuts.some(({ shortcut }) => !shortcut)

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {shortcuts.map(({ name, description, shortcut }) => (
          <li key={name} className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-neutral-200">
            <span>{description}</span>
            {shortcut ? (
              <kbd className="shrink-0 rounded-md border border-slate-300 px-2 py-0.5 font-sans text-xs dark:border-neutral-600">{shortcut}</kbd>
            ) : (
              <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300">Not set</span>
            )}
          </li>
        ))}
      </ul>
      {hasUnsetShortcut && (
        <p role="status" className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Chrome leaves a shortcut unset when another extension already uses its key, or after it was cleared. On websites WriteBetter still answers the
          default key itself, unless another extension takes that key first. Set a key here to be sure.
        </p>
      )}
      <Button className="self-start" onClick={openShortcutSettings}>
        Change shortcuts
      </Button>
    </div>
  )
}

export default ShortcutList
