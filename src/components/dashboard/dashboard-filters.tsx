import * as React from 'react'
import {
  Calendar,
  Layers,
  MapPin,
  RefreshCw,
  LayoutDashboard,
  Clock,
  PackageCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DailyEntryCategory, Floor } from '@/types'
import type {
  DashboardFilters,
  DashboardGroupKey,
  NormalSubCategoryFilter,
} from '@/lib/dashboard/dashboard-types'

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const YEARS = [2024, 2025, 2026, 2027]

interface DashboardFiltersProps {
  filters: DashboardFilters
  onChange: (newFilters: DashboardFilters) => void
  activeGroup: DashboardGroupKey
  onGroupChange: (group: DashboardGroupKey) => void
  normalSubCategory: NormalSubCategoryFilter
  onNormalSubCategoryChange: (sub: NormalSubCategoryFilter) => void
  onRefresh: () => void
  loading: boolean
  allAuthorizedFloors: Floor[]
  authorizedCategories: DailyEntryCategory[]
}

export function DashboardFiltersBar({
  filters,
  onChange,
  activeGroup,
  onGroupChange,
  normalSubCategory,
  onNormalSubCategoryChange,
  onRefresh,
  loading,
  allAuthorizedFloors,
  authorizedCategories,
}: DashboardFiltersProps) {
  const hasRunning = authorizedCategories.includes('RUNNING')
  const hasNew = authorizedCategories.includes('NEW')
  const hasNormalAccess = hasRunning || hasNew
  const hasIdleAccess = authorizedCategories.includes('IDLE')

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      const parts = val.split('-')
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      onChange({
        ...filters,
        date: val,
        month: !isNaN(month) ? month : filters.month,
        year: !isNaN(year) ? year : filters.year,
      })
    }
  }

  const handleFloorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      floorId: e.target.value,
    })
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      month: parseInt(e.target.value, 10),
    })
  }

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      year: parseInt(e.target.value, 10),
    })
  }

  return (
    <div className="bg-white border border-surface-border rounded-erp-lg p-4 shadow-xs space-y-3.5">
      {/* Top Banner + Segmented Group Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-surface-border/80">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
              activeGroup === 'NORMAL'
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-ink uppercase tracking-tight flex items-center gap-2">
              <span>GMS MCD ERP DASHBOARD</span>
            </h1>
            <p className="text-xs text-ink-muted">
              Separated Normal Needle (Running + New) &amp; Idle Needle inventory analytics.
            </p>
          </div>
        </div>

        {/* Segmented Tabs + Refresh */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Group Tabs */}
          <div
            role="tablist"
            aria-label="Dashboard Needle Group"
            className="inline-flex p-1 rounded-erp-lg bg-slate-100 border border-surface-border gap-1 w-full sm:w-auto"
          >
            {hasNormalAccess && (
              <button
                type="button"
                role="tab"
                aria-selected={activeGroup === 'NORMAL'}
                onClick={() => onGroupChange('NORMAL')}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-erp text-xs font-bold tracking-wide transition-all cursor-pointer ${
                  activeGroup === 'NORMAL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink hover:bg-white/60'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                <span>NORMAL NEEDLE (NEW + RUNNING)</span>
              </button>
            )}

            {hasIdleAccess && (
              <button
                type="button"
                role="tab"
                aria-selected={activeGroup === 'IDLE'}
                onClick={() => onGroupChange('IDLE')}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-erp text-xs font-bold tracking-wide transition-all cursor-pointer ${
                  activeGroup === 'IDLE'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink hover:bg-white/60'
                }`}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>IDLE NEEDLE</span>
              </button>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="text-xs font-semibold gap-1.5 h-8 border-brand/30 text-brand hover:bg-brand/10 ml-auto sm:ml-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Filter Selectors Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-0.5">
        {/* Date Filter */}
        <div>
          <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Date
          </label>
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="date"
              value={filters.date}
              onChange={handleDateChange}
              disabled={loading}
              className="w-full text-xs font-semibold pl-8 pr-2 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
            />
          </div>
        </div>

        {/* Floor Filter */}
        <div>
          <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Floor
          </label>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <select
              value={filters.floorId}
              onChange={handleFloorChange}
              disabled={loading}
              className="w-full text-xs font-semibold pl-8 pr-2 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60 truncate"
            >
              <option value="all">All Authorized Floors</option>
              {allAuthorizedFloors.map((fl) => (
                <option key={fl.id} value={fl.id}>
                  {fl.name} {fl.code ? `(${fl.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Group-Scoped Category Filter (Client-Side Instant Switch) */}
        <div>
          <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Category View
          </label>
          <div className="relative">
            <Layers className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            {activeGroup === 'NORMAL' ? (
              <select
                value={normalSubCategory}
                onChange={(e) =>
                  onNormalSubCategoryChange(e.target.value as NormalSubCategoryFilter)
                }
                className="w-full text-xs font-semibold pl-8 pr-2 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {hasRunning && hasNew && (
                  <option value="ALL_NORMAL">All Normal (Running + New)</option>
                )}
                {hasRunning && <option value="RUNNING">Running (Regular) Only</option>}
                {hasNew && <option value="NEW">New Needle Only</option>}
              </select>
            ) : (
              <select
                value="IDLE"
                disabled
                className="w-full text-xs font-semibold pl-8 pr-2 py-1.5 rounded-erp border border-amber-200 bg-amber-50/50 text-amber-800 cursor-not-allowed"
              >
                <option value="IDLE">Idle Needle Only</option>
              </select>
            )}
          </div>
        </div>

        {/* Month Filter */}
        <div>
          <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Month
          </label>
          <select
            value={filters.month}
            onChange={handleMonthChange}
            disabled={loading}
            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Year
          </label>
          <select
            value={filters.year}
            onChange={handleYearChange}
            disabled={loading}
            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
