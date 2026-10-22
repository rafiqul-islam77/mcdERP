import * as React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id || generatedId

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={`w-full px-3 py-2 text-sm bg-white border rounded-erp text-ink placeholder:text-ink-light transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-muted disabled:text-ink-muted disabled:cursor-not-allowed ${
            error ? 'border-danger focus:ring-danger' : 'border-surface-border'
          } ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-danger font-medium">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
