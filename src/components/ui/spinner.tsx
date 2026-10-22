import * as React from 'react'

export function Spinner({
  className = 'w-5 h-5 text-brand',
  size,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export function LoadingSpinner({
  label = 'Loading data...',
  className = '',
}: {
  label?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 gap-3 text-ink-muted ${className}`}>
      <Spinner className="w-7 h-7 text-brand" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}
