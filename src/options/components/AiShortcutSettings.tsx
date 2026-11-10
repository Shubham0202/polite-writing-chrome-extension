import type { ChangeEvent } from 'react'
import Select from '../../components/Select.tsx'
import SwitchField from '../../components/SwitchField.tsx'
import { REWRITE_STYLES, REWRITE_STYLE_LABEL, type RewriteStyle } from '../../constants/ai.ts'
import type { Settings } from '../../constants/settings.ts'

// Pressing the shortcut is as explicit as pressing the popup button, so this needs no new Chrome permission.
interface AiShortcutSettingsProps {
  settings: Settings
  onUpdate: (changes: Partial<Settings>) => Promise<void>
}

const AiShortcutSettings = ({ settings, onUpdate }: AiShortcutSettingsProps) => (
  <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-neutral-700">
    <SwitchField
      id="setting-isAiShortcutEnabled"
      label="Rewrite with AI from the keyboard shortcut"
      description="When on, Ctrl+Shift+Space also sends the text of the field you are in to the AI provider and lists the rewrite with the other suggestions. The list has the same switch."
      checked={settings.isAiShortcutEnabled}
      disabled={!settings.isInlineEnabled}
      onChange={(isAiShortcutEnabled) => onUpdate({ isAiShortcutEnabled })}
    />
    <div className="flex items-center gap-3">
      <label htmlFor="setting-aiShortcutStyle" className="text-sm font-medium text-slate-700 dark:text-neutral-200">
        Style for the shortcut
      </label>
      <Select
        id="setting-aiShortcutStyle"
        className="py-2"
        value={settings.aiShortcutStyle}
        disabled={!settings.isInlineEnabled}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onUpdate({ aiShortcutStyle: event.target.value as RewriteStyle })}
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
