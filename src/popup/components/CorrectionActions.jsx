import Button from '../../components/Button.jsx'
import Select from '../../components/Select.jsx'
import { ACTION_LABEL, CORRECTION_ACTIONS, TONES, TONE_LABEL } from '../../constants/corrections.js'
import RewriteActions from './RewriteActions.jsx'

const SINGLE_ACTIONS = [CORRECTION_ACTIONS.fixGrammar, CORRECTION_ACTIONS.makePolite, CORRECTION_ACTIONS.professional]

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
}) => {
  const isBusy = Boolean(pendingAction)

  const handleToneChange = (event) => onToneChange(event.target.value)

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
