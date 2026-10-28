import React from 'react'

export function ReportSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Metadata bar skeleton */}
      <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-erp w-full" />

      {/* Table skeleton */}
      <div className="border border-surface-border rounded-erp bg-surface overflow-hidden">
        <div className="h-11 bg-slate-900 border-b border-surface-border" />
        <div className="divide-y divide-surface-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 flex items-center px-4 gap-4">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-8" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-36" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16 ml-auto" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" />
              <div className="h-4 bg-amber-100 dark:bg-amber-950/40 rounded w-20" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="h-12 bg-slate-100 dark:bg-slate-800/60 border-t border-surface-border" />
      </div>
    </div>
  )
}
