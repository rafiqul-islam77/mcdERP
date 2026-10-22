import * as React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
}

export function Badge({ className = '', variant = 'neutral', children, ...props }: BadgeProps) {
  const styles = {
    info: 'bg-brand/10 text-brand border-brand/20',
    success: 'bg-success/15 text-success-dark border-success/30',
    warning: 'bg-warning/15 text-warning-dark border-warning/30',
    danger: 'bg-danger/15 text-danger-dark border-danger/30',
    neutral: 'bg-surface-muted text-ink-muted border-surface-border',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
