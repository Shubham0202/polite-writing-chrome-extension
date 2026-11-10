import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  description?: string
  children: ReactNode
}

const SettingsSection = ({ title, description, children }: SettingsSectionProps) => (
  <section aria-label={title} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-col gap-0.5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
)

export default SettingsSection
