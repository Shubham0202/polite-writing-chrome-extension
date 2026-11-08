import { DELAY_LIMITS_MS } from '../../constants/settings.js'

const DelayField = ({ delayMs, disabled, onChange }) => {
  const handleChange = (event) => onChange(Number(event.target.value))

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="suggestion-delay" className="text-sm font-medium text-slate-700">
        Check after a pause of
      </label>
      <input
        id="suggestion-delay"
        type="range"
        min={DELAY_LIMITS_MS.min}
        max={DELAY_LIMITS_MS.max}
        step={DELAY_LIMITS_MS.step}
        value={delayMs}
        disabled={disabled}
        onChange={handleChange}
        className="flex-1 accent-brand-600"
      />
      <output htmlFor="suggestion-delay" className="w-20 text-right text-sm text-slate-700">
        {delayMs / 1000} {delayMs === 1000 ? 'second' : 'seconds'}
      </output>
    </div>
  )
}

export default DelayField
