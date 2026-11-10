import type { ChangeEvent, ReactNode } from 'react'

export interface SwitchFieldProps {
  id: string
  label: ReactNode
  description?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (isChecked: boolean) => void
}

const SwitchField = ({ id, label, description, checked, disabled = false, onChange }: SwitchFieldProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)

  return (
    <div className="flex gap-2">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        className="mt-0.5 size-4 shrink-0 accent-brand-600"
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  )
}

export default SwitchField
