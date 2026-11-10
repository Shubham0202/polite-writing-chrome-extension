import Button from '../../components/Button.tsx'
import SwitchField from '../../components/SwitchField.tsx'
import type { Settings } from '../../constants/settings.ts'
import { isSiteListed, isSitePaused, setSitePaused } from '../../services/settings.ts'

export interface InlineControlsProps {
  settings: Settings
  hostname: string | null
  onUpdate: (changes: Partial<Settings>) => void
  onOpenSettings: () => void
}

const InlineControls = ({ settings, hostname, onUpdate, onOpenSettings }: InlineControlsProps) => {
  const canPauseSite = hostname && isSiteListed(settings, hostname)

  const handleInlineChange = (isInlineEnabled: boolean) => onUpdate({ isInlineEnabled })
  const handleSiteChange = (isEnabled: boolean) => onUpdate({ pausedSites: setSitePaused(settings, hostname!, !isEnabled) })

  return (
    <section aria-label="Inline suggestions" className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex min-w-0 flex-col gap-2">
        <SwitchField id="inline-enabled" label="Suggestions on websites" checked={settings.isInlineEnabled} onChange={handleInlineChange} />
        {canPauseSite && (
          <SwitchField
            id="site-enabled"
            label={`On ${hostname}`}
            checked={!isSitePaused(settings, hostname)}
            disabled={!settings.isInlineEnabled}
            onChange={handleSiteChange}
          />
        )}
      </div>
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onOpenSettings}>
        Settings
      </Button>
    </section>
  )
}

export default InlineControls
