import type { ChangeEvent } from 'react'
import Select from '../../components/Select.tsx'
import { THEMES, THEME_LABEL, type Theme } from '../../constants/settings.ts'

interface ThemeFieldProps {
  theme: Theme
  onChange: (theme: Theme) => void
}

const ThemeField = ({ theme, onChange }: ThemeFieldProps) => {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as Theme)

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="setting-theme" className="text-sm font-medium text-slate-700 dark:text-neutral-200">
        Theme
      </label>
      <Select id="setting-theme" className="py-2" value={theme} onChange={handleChange}>
        {Object.values(THEMES).map((themeOption) => (
          <option key={themeOption} value={themeOption}>
            {THEME_LABEL[themeOption]}
          </option>
        ))}
      </Select>
    </div>
  )
}

export default ThemeField
