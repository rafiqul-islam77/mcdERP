import * as React from 'react'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, hint, id, children, ...props }, ref) => {
    const generatedId = React.useId()
    const selectId = id || generatedId

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={`w-full px-3 py-2 text-sm bg-white border rounded-erp text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-muted disabled:text-ink-muted disabled:cursor-not-allowed ${
            error ? 'border-danger focus:ring-danger' : 'border-surface-border'
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-danger font-medium">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'
