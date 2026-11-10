import type { ChangeEventHandler } from 'react'
import { MAX_TEXT_LENGTH } from '../../constants/corrections.ts'

export interface TextInputProps {
  value: string
  onChange: ChangeEventHandler<HTMLTextAreaElement>
  isReadOnly: boolean
}

const TextInput = ({ value, onChange, isReadOnly }: TextInputProps) => {
  const isTooLong = value.length > MAX_TEXT_LENGTH

  return (
    <section className="flex flex-col gap-2">
      <label htmlFor="writing-input" className="text-sm font-medium text-slate-700 dark:text-neutral-200">
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
        className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none read-only:bg-slate-50 aria-invalid:border-rose-400 dark:border-neutral-600 dark:focus:ring-brand-500/30 dark:read-only:bg-neutral-800"
      />
      <p className={`text-right text-xs ${isTooLong ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-neutral-500'}`}>
        {value.length.toLocaleString('en-US')} / {MAX_TEXT_LENGTH.toLocaleString('en-US')} characters
      </p>
    </section>
  )
}

export default TextInput
