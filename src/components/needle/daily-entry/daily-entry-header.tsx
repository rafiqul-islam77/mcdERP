'use client'

import * as React from 'react'
import { Calendar, Building2, Tag, Search, User, RefreshCw } from 'lucide-react'
import { SaveStatusIndicator, type SaveStatus } from '@/components/needle/save-status-indicator'
import type { DailyEntryCategory, Floor, CurrentUser } from '@/types'

interface DailyEntryHeaderProps {
  date: string
  onDateChange: (newDate: string) => void
  floorId: string
  onFloorChange: (newFloorId: string) => void
  category: DailyEntryCategory
  onCategoryChange: (newCategory: DailyEntryCategory) => void
  authorizedFloors: Floor[]
  allowedCategories: DailyEntryCategory[]
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  saveError: string | null
  pendingCount?: number
  conflictCount?: number
  onRetry?: () => void
  onOpenConflicts?: () => void
  searchTerm: string
  onSearchChange: (term: string) => void
  user: CurrentUser
  onReload: () => void
  disabled?: boolean
  requisitionNo?: string | null
  onOpenRequisitionModal?: () => void
}

export function DailyEntryHeader({
  date,
  onDateChange,
  floorId,
  onFloorChange,
  category,
  onCategoryChange,
  authorizedFloors,
  allowedCategories,
  saveStatus,
  lastSavedAt,
  saveError,
  pendingCount = 0,
  conflictCount = 0,
  onRetry,
  onOpenConflicts,
  searchTerm,
  onSearchChange,
  user,
  onReload,
  disabled = false,
  requisitionNo,
  onOpenRequisitionModal,
}: DailyEntryHeaderProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-2 sm:p-2.5 shadow-xs space-y-1.5">
      {/* Top row: Module title, subtle user badge, save status indicator + reload button (Image 3) */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand" />
          <h1 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight">
            Daily Needle Entry
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/10 text-brand dark:text-blue-400">
            {category}
          </span>
          {requisitionNo && (
            <button
              type="button"
              onClick={onOpenRequisitionModal}
              title="Click to view or update floor requisition number"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-[10px] text-emerald-800 dark:text-emerald-300 font-mono font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
            >
              <span>REQ:</span>
              <span>{requisitionNo}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Subtle authenticated operator tracking display */}
          <div className="hidden md:flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/60">
            <User className="w-3 h-3 text-slate-400" />
            <span className="font-medium text-slate-700 dark:text-slate-300">{user.profile.name}</span>
            <span className="text-slate-400">({user.profile.employee_id})</span>
          </div>

          {/* Status Capsule + Offline Ready Capsule + Reload Button */}
          <div className="flex items-center gap-1.5">
            <SaveStatusIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              errorMessage={saveError}
              pendingCount={pendingCount}
              conflictCount={conflictCount}
              onRetry={onRetry}
              onOpenConflicts={onOpenConflicts}
            />
            <button
              type="button"
              onClick={onReload}
              disabled={disabled}
              title="Reload sheet data"
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${disabled ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Control filters row: Date, Floor, Category, Search */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {/* Date Selector */}
        <div className="space-y-0.5">
          <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>Date</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={disabled}
            className="w-full text-xs h-7 px-2 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand font-mono"
          />
        </div>

        {/* Floor Selector (Restricted to Authorized Floors) */}
        <div className="space-y-0.5">
          <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            <Building2 className="w-3 h-3 text-slate-400" />
            <span>Floor</span>
          </label>
          <select
            value={floorId}
            onChange={(e) => onFloorChange(e.target.value)}
            disabled={disabled || authorizedFloors.length === 0}
            className="w-full text-xs h-7 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {authorizedFloors.length === 0 ? (
              <option value="">No floors assigned</option>
            ) : (
              authorizedFloors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Category Selector (Restricted to Permitted Categories) */}
        <div className="space-y-0.5">
          <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            <Tag className="w-3 h-3 text-slate-400" />
            <span>Category</span>
          </label>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as DailyEntryCategory)}
            disabled={disabled || allowedCategories.length === 0}
            className="w-full text-xs h-7 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand font-semibold"
          >
            {allowedCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Search / Filter Needles */}
        <div className="space-y-0.5">
          <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            <Search className="w-3 h-3 text-slate-400" />
            <span>Search Filter</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Code, type, size..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full text-xs h-7 pl-7 pr-2 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-slate-400"
            />
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
          </div>
        </div>
      </div>
    </div>
  )
}
