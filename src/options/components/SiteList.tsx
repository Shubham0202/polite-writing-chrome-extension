import { useState, type ChangeEvent, type FormEvent } from 'react'
import Button from '../../components/Button.tsx'
import SwitchField from '../../components/SwitchField.tsx'
import type { Settings } from '../../constants/settings.ts'
import { getSiteRows, isSitePaused, setSitePaused } from '../../services/settings.ts'

interface SiteListProps {
  settings: Settings
  error: string | null
  onUpdate: (changes: Partial<Settings>) => Promise<void>
  onAdd: (input: string) => Promise<boolean>
  onRemove: (hostname: string) => Promise<void>
}

const SiteList = ({ settings, error, onUpdate, onAdd, onRemove }: SiteListProps) => {
  const [input, setInput] = useState('')

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => setInput(event.target.value)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await onAdd(input)) setInput('')
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {getSiteRows(settings).map(({ hostname, label, isCustom }) => (
          <li key={hostname} className="flex items-start justify-between gap-2">
            <SwitchField
              id={`site-${hostname}`}
              label={label}
              description={label === hostname ? null : hostname}
              checked={!isSitePaused(settings, hostname)}
              onChange={(isEnabled) => onUpdate({ pausedSites: setSitePaused(settings, hostname, !isEnabled) })}
            />
            {isCustom && (
              <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Remove ${hostname}`} onClick={() => onRemove(hostname)}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <label htmlFor="site-input" className="text-sm font-medium text-slate-700">
          Add a website
        </label>
        <div className="flex gap-2">
          <input
            id="site-input"
            value={input}
            onChange={handleInputChange}
            placeholder="example.com"
            aria-invalid={Boolean(error)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <Button type="submit">Add</Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-rose-700">
            {error}
          </p>
        )}
        <p className="text-xs text-slate-500">Chrome asks for access to that site only. Reload its open tabs afterwards.</p>
      </form>
    </div>
  )
}

export default SiteList
