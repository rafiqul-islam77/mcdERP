import * as React from 'react'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

export function Card({ className = '', title, description, actions, children, ...props }: CardProps) {
  return (
    <div className={`bg-surface-card border border-surface-border rounded-erp-lg shadow-erp overflow-hidden ${className}`} {...props}>
      {(title || actions || description) && (
        <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            {title && <h3 className="text-base font-semibold text-ink leading-tight">{title}</h3>}
            {description && <p className="text-xs text-ink-muted mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
