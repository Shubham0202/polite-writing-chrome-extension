import type { ComponentProps } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  isLoading?: boolean
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
}

const Button = ({ variant = 'secondary', isLoading = false, disabled = false, className = '', children, ...others }: ButtonProps) => (
  <button
    type="button"
    {...others}
    disabled={disabled || isLoading}
    aria-busy={isLoading}
    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:outline-none dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
  >
    {isLoading && (
      <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
    )}
    {children}
  </button>
)

export default Button
