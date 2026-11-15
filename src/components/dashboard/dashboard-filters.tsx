import * as React from 'react'
import {
  Calendar,
  Layers,
  MapPin,
  RefreshCw,
  LayoutDashboard,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DailyEntryCategory, Floor } from '@/types'
import type { DashboardFilters } from '@/lib/dashboard/dashboard-types'

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
  onRefresh: () => void
  loading: boolean
  allAuthorizedFloors: Floor[]
  authorizedCategories: DailyEntryCategory[]
}

export function DashboardFiltersBar({
  filters,
  onChange,
  onRefresh,
  loading,
  allAuthorizedFloors,
  authorizedCategories,
}: DashboardFiltersProps) {
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

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      category: e.target.value as 'ALL' | DailyEntryCategory,
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
    <div className="bg-white border border-surface-border rounded-erp-lg p-4 shadow-xs space-y-3">
      {/* Top Banner Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-border/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-brand border border-blue-100 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-ink uppercase tracking-tight flex items-center gap-2">
              <span>GMS MCD ERP DASHBOARD</span>
            </h1>
            <p className="text-xs text-ink-muted">
              Live needle inventory, transactions, floor metrics & management analytics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="text-xs font-semibold gap-1.5 h-8 border-brand/30 text-brand hover:bg-brand/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Filter Selectors Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
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

        {/* Category Filter */}
        <div>
          <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Category
          </label>
          <div className="relative">
            <Layers className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <select
              value={filters.category}
              onChange={handleCategoryChange}
              disabled={loading}
              className="w-full text-xs font-semibold pl-8 pr-2 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
            >
              <option value="ALL">All Categories</option>
              {authorizedCategories.includes('RUNNING') && (
                <option value="RUNNING">Running / Regular</option>
              )}
              {authorizedCategories.includes('NEW') && (
                <option value="NEW">New Needle</option>
              )}
              {authorizedCategories.includes('IDLE') && (
                <option value="IDLE">Idle Needle</option>
              )}
            </select>
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
