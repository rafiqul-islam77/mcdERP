'use client'

import * as React from 'react'
import { Check, Loader2, AlertCircle, Edit3 } from 'lucide-react'

export type SaveStatus = 'idle' | 'draft' | 'saving' | 'saved' | 'error'

interface SaveStatusIndicatorProps {
  status: SaveStatus
  lastSavedAt?: Date | null
  errorMessage?: string | null
}

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
}: SaveStatusIndicatorProps) {
  if (status === 'idle' && !lastSavedAt) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        <span>Ready</span>
      </div>
    )
  }

  if (status === 'draft') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200">
        <Edit3 className="w-3 h-3 text-amber-600" />
        <span>Unsaved Draft</span>
      </div>
    )
  }

  if (status === 'saving') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 transition-colors duration-150">
        <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
        <span>Saving...</span>
      </div>
    )
  }

  if (status === 'saved') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 transition-opacity duration-300">
        <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
        <span>Saved ✓</span>
        {lastSavedAt && (
          <span className="text-emerald-600/70 text-[10px] hidden sm:inline">
            ({lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
          </span>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200"
        title={errorMessage || 'Error saving changes'}
      >
        <AlertCircle className="w-3 h-3 text-rose-600" />
        <span>Save Failed</span>
      </div>
    )
  }

  return null
}
