import { MAX_TEXT_LENGTH } from '../../constants/corrections.js'

const TextInput = ({ value, onChange, isReadOnly }) => {
  const isTooLong = value.length > MAX_TEXT_LENGTH

  return (
    <section className="flex flex-col gap-2">
      <label htmlFor="writing-input" className="text-sm font-medium text-slate-700">
        Your text
      </label>
      <textarea
        id="writing-input"
        value={value}
        onChange={onChange}
        readOnly={isReadOnly}
        rows={5}
        placeholder="Type or paste the text you want to improve…"
        aria-invalid={isTooLong}
        className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none read-only:bg-slate-50 aria-invalid:border-rose-400"
      />
      <p className={`text-right text-xs ${isTooLong ? 'text-rose-600' : 'text-slate-400'}`}>
        {value.length.toLocaleString('en-US')} / {MAX_TEXT_LENGTH.toLocaleString('en-US')} characters
      </p>
    </section>
  )
}

export default TextInput
