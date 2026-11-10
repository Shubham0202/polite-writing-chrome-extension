import type { ChangeEvent } from 'react'
import Button from '../../components/Button.tsx'
import Select from '../../components/Select.tsx'
import { REWRITE_STYLES, REWRITE_STYLE_LABEL, type RewriteStyle } from '../../constants/ai.ts'
import { REWRITE_ACTION } from '../../constants/corrections.ts'
import type { PendingAction } from '../hooks/useCorrection.ts'

// What sits next to the button: Cancel while a rewrite runs, a way to Settings while there is no key, else the style.
interface SecondSlotProps {
  isRewriting: boolean
  needsSetup: boolean
  isBusy: boolean
  style: RewriteStyle
  onStyleChange: (style: RewriteStyle) => void
  onCancel: () => void
  onOpenSettings: () => void
}

const SecondSlot = ({ isRewriting, needsSetup, isBusy, style, onStyleChange, onCancel, onOpenSettings }: SecondSlotProps) => {
  if (isRewriting) return <Button onClick={onCancel}>Cancel</Button>
  if (needsSetup) {
    // Opening Settings closes the popup, which would abandon a correction that is still running.
    return (
      <Button variant="ghost" onClick={onOpenSettings} disabled={isBusy} title="Add an API key in Settings to rewrite with AI">
        Set up
      </Button>
    )
  }

  const handleStyleChange = (event: ChangeEvent<HTMLSelectElement>) => onStyleChange(event.target.value as RewriteStyle)

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
export interface RewriteActionsProps {
  pendingAction: PendingAction | null
  isAiConfigured: boolean | null
  style: RewriteStyle
  onStyleChange: (style: RewriteStyle) => void
  onRun: () => void
  onCancel: () => void
  onOpenSettings: () => void
}

const RewriteActions = ({ pendingAction, isAiConfigured, style, onStyleChange, onRun, onCancel, onOpenSettings }: RewriteActionsProps) => {
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
