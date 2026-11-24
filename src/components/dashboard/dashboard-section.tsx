import * as React from 'react'

export type SectionContainerVariant =
  | 'default'
  | 'soft-blue'
  | 'soft-purple'
  | 'soft-green'
  | 'soft-teal'
  | 'soft-amber'
  | 'neutral'

export type SectionHeaderTone =
  | 'light'
  | 'blue'
  | 'purple'
  | 'indigo'
  | 'emerald'
  | 'teal'
  | 'amber'
  | 'rose'

interface DashboardSectionProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  accentColor?: string
  containerVariant?: SectionContainerVariant
  headerTone?: SectionHeaderTone
  children: React.ReactNode
  className?: string
  headerActions?: React.ReactNode
}

const CONTAINER_CLASSES: Record<SectionContainerVariant, string> = {
  default: 'bg-white border-surface-border',
  'soft-blue': 'bg-gradient-to-br from-white via-blue-50/35 to-sky-50/50 border-blue-200/70',
  'soft-purple': 'bg-gradient-to-br from-white via-purple-50/35 to-fuchsia-50/40 border-purple-200/70',
  'soft-green': 'bg-gradient-to-br from-white via-emerald-50/35 to-teal-50/40 border-emerald-200/70',
  'soft-teal': 'bg-gradient-to-br from-white via-teal-50/35 to-cyan-50/45 border-teal-200/70',
  'soft-amber': 'bg-gradient-to-br from-white via-amber-50/35 to-orange-50/45 border-amber-200/70',
  neutral: 'bg-slate-50/60 border-slate-200',
}

const HEADER_CLASSES: Record<SectionHeaderTone, string> = {
  light: 'bg-slate-50/80 border-surface-border',
  blue: 'bg-blue-50/85 border-blue-100',
  purple: 'bg-purple-50/85 border-purple-100',
  indigo: 'bg-indigo-50/85 border-indigo-100',
  emerald: 'bg-emerald-50/85 border-emerald-100',
  teal: 'bg-teal-50/85 border-teal-100',
  amber: 'bg-amber-50/85 border-amber-100',
  rose: 'bg-rose-50/85 border-rose-100',
}

export function DashboardSection({
  title,
  subtitle,
  icon,
  badge,
  accentColor = 'border-l-brand',
  containerVariant = 'default',
  headerTone = 'light',
  children,
  className = '',
  headerActions,
}: DashboardSectionProps) {
  return (
    <div
      className={`rounded-erp-lg border shadow-xs overflow-hidden flex flex-col ${CONTAINER_CLASSES[containerVariant]} ${className}`}
    >
      {/* Section Header */}
      <div
        className={`px-4 py-3 border-b flex items-center justify-between gap-3 border-l-4 ${accentColor} ${HEADER_CLASSES[headerTone]}`}
      >
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
