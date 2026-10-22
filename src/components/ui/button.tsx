import * as React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  loadingText?: string
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const base =
      'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed rounded-erp select-none whitespace-nowrap'

    const sizeStyles = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5 min-h-[30px]',
      md: 'text-sm px-3.5 py-2 gap-2 min-h-[38px]',
      lg: 'text-base px-5 py-2.5 gap-2.5 min-h-[44px]',
    }

    const variantStyles = {
      primary: 'bg-brand hover:bg-brand-hover text-white focus:ring-brand shadow-sm',
      secondary: 'bg-surface-muted hover:bg-surface-border text-ink focus:ring-brand',
      outline: 'border border-surface-border bg-white hover:bg-surface-muted text-ink focus:ring-brand',
      danger: 'bg-danger hover:bg-danger-dark text-white focus:ring-danger shadow-sm',
      success: 'bg-success hover:bg-success-dark text-white focus:ring-success shadow-sm',
      ghost: 'bg-transparent hover:bg-surface-muted text-ink focus:ring-brand',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        className={`${base} ${sizeStyles[size]} ${variantStyles[variant]} ${loading ? 'pointer-events-none' : ''} ${className}`}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-0.5 h-3.5 w-3.5 shrink-0 text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {loading && loadingText ? <span>{loadingText}</span> : children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export function ButtonLoader({
  text = 'Processing...',
  className = '',
}: {
  text?: string
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg
        className="animate-spin -ml-0.5 h-3.5 w-3.5 shrink-0 text-current"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span>{text}</span>
    </span>
  )
}

export const LoadingButton = Button
