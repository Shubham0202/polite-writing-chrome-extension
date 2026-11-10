import type { ComponentProps } from 'react'

export type SelectProps = ComponentProps<'select'>

const Select = ({ className = '', children, ...others }: SelectProps) => (
  <select
    {...others}
    className={`rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:ring-brand-500/30 ${className}`}
  >
    {children}
  </select>
)

export default Select
