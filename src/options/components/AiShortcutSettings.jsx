import Select from '../../components/Select.jsx'
import SwitchField from '../../components/SwitchField.jsx'
import { REWRITE_STYLES, REWRITE_STYLE_LABEL } from '../../constants/ai.js'

// Pressing the shortcut is as explicit as pressing the popup button, so this needs no new Chrome permission.
const AiShortcutSettings = ({ settings, onUpdate }) => (
  <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
    <SwitchField
      id="setting-isAiShortcutEnabled"
      label="Rewrite with AI from the keyboard shortcut"
      description="When on, Ctrl+Shift+Space also sends the text of the field you are in to the AI provider and lists the rewrite with the other suggestions. The list has the same switch."
      checked={settings.isAiShortcutEnabled}
      disabled={!settings.isInlineEnabled}
      onChange={(isAiShortcutEnabled) => onUpdate({ isAiShortcutEnabled })}
    />
    <div className="flex items-center gap-3">
      <label htmlFor="setting-aiShortcutStyle" className="text-sm font-medium text-slate-700">
        Style for the shortcut
      </label>
      <Select
        id="setting-aiShortcutStyle"
        className="py-2"
        value={settings.aiShortcutStyle}
        disabled={!settings.isInlineEnabled}
        onChange={(event) => onUpdate({ aiShortcutStyle: event.target.value })}
      >
        {Object.values(REWRITE_STYLES).map((style) => (
          <option key={style} value={style}>
            {REWRITE_STYLE_LABEL[style]}
          </option>
        ))}
      </Select>
    </div>
  </div>
)

export default AiShortcutSettings
