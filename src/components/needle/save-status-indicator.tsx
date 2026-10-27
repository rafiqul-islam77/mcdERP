'use client'

import * as React from 'react'
import { Check, Loader2, AlertCircle, Edit3, WifiOff, AlertTriangle } from 'lucide-react'

export type SaveStatus =
  | 'idle'
  | 'draft'
  | 'saving'
  | 'syncing'
  | 'saved'
  | 'offline'
  | 'error'
  | 'conflict'

interface SaveStatusIndicatorProps {
  status: SaveStatus
  lastSavedAt?: Date | null
  errorMessage?: string | null
  pendingCount?: number
  conflictCount?: number
  onRetry?: () => void
  onOpenConflicts?: () => void
}

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
  pendingCount = 0,
  conflictCount = 0,
  onRetry,
  onOpenConflicts,
}: SaveStatusIndicatorProps) {
  if (status === 'offline') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-slate-700 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 select-none"
        title="Internet connection unavailable. Inputs are safely stored locally."
      >
        <WifiOff className="w-3 h-3 text-slate-500" />
        <span>Offline • {pendingCount} pending</span>
      </div>
    )
  }

  if (status === 'syncing') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 transition-colors duration-150 select-none">
        <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
        <span>Saved locally • Syncing...</span>
      </div>
    )
  }

  if (status === 'saving') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 transition-colors duration-150 select-none">
        <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
        <span>Saving...</span>
      </div>
    )
  }

  if (status === 'conflict') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 select-none cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors"
        title={errorMessage || 'Stock validation conflict on sync. Server stock data changed. Click to resolve.'}
        onClick={onOpenConflicts}
      >
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        <span>Conflict • {conflictCount || 1} items</span>
        {onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRetry()
            }}
            className="underline hover:text-amber-950 ml-0.5 font-semibold text-[11px]"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 select-none"
        title={errorMessage || 'Sync failed. Will retry automatically.'}
      >
        <AlertCircle className="w-3 h-3 text-rose-600" />
        <span>Sync failed • {pendingCount} pending</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="underline hover:text-rose-900 dark:hover:text-rose-100 ml-0.5 font-semibold text-[11px]"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (status === 'draft') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 select-none">
        <Edit3 className="w-3 h-3 text-amber-600" />
        <span>Unsaved Draft</span>
      </div>
    )
  }

  if (status === 'saved' || (status === 'idle' && lastSavedAt)) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 transition-opacity duration-300 select-none">
        <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
        <span>Saved ✓</span>
        {lastSavedAt && (
          <span className="text-emerald-600/70 dark:text-emerald-400/70 text-[10px] hidden sm:inline">
            ({lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 select-none">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      <span>Ready</span>
    </div>
  )
}
