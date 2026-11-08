import Button from '../../components/Button.jsx'
import SwitchField from '../../components/SwitchField.jsx'
import { isSiteListed, isSitePaused, setSitePaused } from '../../services/settings.js'

const InlineControls = ({ settings, hostname, onUpdate, onOpenSettings }) => {
  const canPauseSite = hostname && isSiteListed(settings, hostname)

  const handleInlineChange = (isInlineEnabled) => onUpdate({ isInlineEnabled })
  const handleSiteChange = (isEnabled) => onUpdate({ pausedSites: setSitePaused(settings, hostname, !isEnabled) })

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
