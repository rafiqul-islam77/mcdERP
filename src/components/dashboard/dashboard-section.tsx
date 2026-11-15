import * as React from 'react'

interface DashboardSectionProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  accentColor?: string // Tailwind border or background class
  children: React.ReactNode
  className?: string
  headerActions?: React.ReactNode
}

export function DashboardSection({
  title,
  subtitle,
  icon,
  badge,
  accentColor = 'border-l-brand',
  children,
  className = '',
  headerActions,
}: DashboardSectionProps) {
  return (
    <div
      className={`bg-white rounded-erp-lg border border-surface-border shadow-xs overflow-hidden flex flex-col ${className}`}
    >
      {/* Section Header */}
      <div className={`px-4 py-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-surface-border flex items-center justify-between gap-3 border-l-4 ${accentColor}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="text-ink-muted shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-ink uppercase tracking-wide truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] text-ink-muted truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {headerActions}
        </div>
      </div>

      {/* Section Body */}
      <div className="p-4 flex-1 flex flex-col">{children}</div>
    </div>
  )
}
