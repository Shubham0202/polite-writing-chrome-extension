import Button from '../../components/Button.jsx'
import Select from '../../components/Select.jsx'
import { REWRITE_STYLES, REWRITE_STYLE_LABEL } from '../../constants/ai.js'
import { REWRITE_ACTION } from '../../constants/corrections.js'

// What sits next to the button: Cancel while a rewrite runs, a way to Settings while there is no key, else the style.
const SecondSlot = ({ isRewriting, needsSetup, isBusy, style, onStyleChange, onCancel, onOpenSettings }) => {
  if (isRewriting) return <Button onClick={onCancel}>Cancel</Button>
  if (needsSetup) {
    // Opening Settings closes the popup, which would abandon a correction that is still running.
    return (
      <Button variant="ghost" onClick={onOpenSettings} disabled={isBusy} title="Add an API key in Settings to rewrite with AI">
        Set up
      </Button>
    )
  }

  const handleStyleChange = (event) => onStyleChange(event.target.value)

  return (
    <>
      <label htmlFor="rewrite-style" className="sr-only">
        Rewriting style
      </label>
      <Select id="rewrite-style" value={style} onChange={handleStyleChange} disabled={isBusy}>
        {Object.values(REWRITE_STYLES).map((option) => (
          <option key={option} value={option}>
            {REWRITE_STYLE_LABEL[option]}
          </option>
        ))}
      </Select>
    </>
  )
}

// The one action that sends text off this computer: it says so in its name and only ever runs on a click.
const RewriteActions = ({ pendingAction, isAiConfigured, style, onStyleChange, onRun, onCancel, onOpenSettings }) => {
  const isBusy = Boolean(pendingAction)
  const isRewriting = pendingAction === REWRITE_ACTION

  return (
    <div className="flex gap-2">
      <Button className="flex-1" onClick={onRun} isLoading={isRewriting} disabled={isBusy}>
        {isRewriting ? 'Rewriting…' : 'Rewrite with AI'}
      </Button>
      <SecondSlot
        isRewriting={isRewriting}
        // Unknown counts as configured, so someone who has a key never sees "Set up" flash while the popup connects.
        needsSetup={isAiConfigured === false}
        isBusy={isBusy}
        style={style}
        onStyleChange={onStyleChange}
        onCancel={onCancel}
        onOpenSettings={onOpenSettings}
      />
    </div>
  )
}

export default RewriteActions
