const Select = ({ className = '', children, ...others }) => (
  <select
    {...others}
    className={`rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:opacity-50 ${className}`}
  >
    {children}
  </select>
)

export default Select
