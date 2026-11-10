import type { ChangeEvent } from 'react'
import Button from '../../components/Button.tsx'
import Select from '../../components/Select.tsx'
import type { RewriteStyle } from '../../constants/ai.ts'
import { ACTION_LABEL, CORRECTION_ACTIONS, TONES, TONE_LABEL, type CorrectionAction, type Tone } from '../../constants/corrections.ts'
import type { PendingAction } from '../hooks/useCorrection.ts'
import RewriteActions from './RewriteActions.tsx'

const SINGLE_ACTIONS = [CORRECTION_ACTIONS.fixGrammar, CORRECTION_ACTIONS.makePolite, CORRECTION_ACTIONS.professional]

export interface CorrectionActionsProps {
  pendingAction: PendingAction | null
  tone: Tone
  onToneChange: (tone: Tone) => void
  onRun: (action: CorrectionAction) => void
  isAiConfigured: boolean | null
  rewriteStyle: RewriteStyle
  onRewriteStyleChange: (style: RewriteStyle) => void
  onRewrite: () => void
  onCancelRewrite: () => void
  onOpenSettings: () => void
}

const CorrectionActions = ({
  pendingAction,
  tone,
  onToneChange,
  onRun,
  isAiConfigured,
  rewriteStyle,
  onRewriteStyleChange,
  onRewrite,
  onCancelRewrite,
  onOpenSettings,
}: CorrectionActionsProps) => {
  const isBusy = Boolean(pendingAction)

  const handleToneChange = (event: ChangeEvent<HTMLSelectElement>) => onToneChange(event.target.value as Tone)

  return (
    <section aria-label="Corrections" className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {SINGLE_ACTIONS.map((action) => (
          <Button key={action} onClick={() => onRun(action)} isLoading={pendingAction === action} disabled={isBusy}>
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => onRun(CORRECTION_ACTIONS.fixEverything)}
          isLoading={pendingAction === CORRECTION_ACTIONS.fixEverything}
          disabled={isBusy}
        >
          {ACTION_LABEL[CORRECTION_ACTIONS.fixEverything]}
        </Button>
        <label htmlFor="fix-everything-tone" className="sr-only">
          Tone used by Fix Everything
        </label>
        <Select id="fix-everything-tone" value={tone} onChange={handleToneChange} disabled={isBusy}>
          {Object.values(TONES).map((toneOption) => (
            <option key={toneOption} value={toneOption}>
              {TONE_LABEL[toneOption]} tone
            </option>
          ))}
        </Select>
      </div>
      <RewriteActions
        pendingAction={pendingAction}
        isAiConfigured={isAiConfigured}
        style={rewriteStyle}
        onStyleChange={onRewriteStyleChange}
        onRun={onRewrite}
        onCancel={onCancelRewrite}
        onOpenSettings={onOpenSettings}
      />
    </section>
  )
}

export default CorrectionActions
