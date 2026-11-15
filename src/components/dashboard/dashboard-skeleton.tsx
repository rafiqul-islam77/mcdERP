import * as React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Filter Bar Skeleton */}
      <div className="bg-white p-4 rounded-erp-lg border border-surface-border shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-48 h-5 rounded" />
            <Skeleton className="w-32 h-3 rounded" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="w-32 h-8 rounded" />
          <Skeleton className="w-36 h-8 rounded" />
          <Skeleton className="w-32 h-8 rounded" />
          <Skeleton className="w-24 h-8 rounded" />
          <Skeleton className="w-20 h-8 rounded" />
          <Skeleton className="w-24 h-8 rounded" />
        </div>
      </div>

      {/* 7 KPI Cards Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="bg-white p-3.5 rounded-erp-lg border border-surface-border shadow-xs space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="w-16 h-3 rounded" />
              <Skeleton className="w-7 h-7 rounded-lg" />
            </div>
            <Skeleton className="w-20 h-6 rounded" />
            <Skeleton className="w-12 h-2.5 rounded" />
          </div>
        ))}
      </div>

      {/* Two-Column Chart Skeletons */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white p-4 rounded-erp-lg border border-surface-border shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-surface-border">
              <Skeleton className="w-64 h-4 rounded" />
              <Skeleton className="w-20 h-4 rounded" />
            </div>
            <Skeleton className="w-full h-64 rounded-erp" />
          </div>
          <div className="bg-white p-4 rounded-erp-lg border border-surface-border shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-surface-border">
              <Skeleton className="w-40 h-4 rounded" />
              <Skeleton className="w-16 h-4 rounded" />
            </div>
            <Skeleton className="w-full h-64 rounded-erp" />
          </div>
        </div>
      ))}
    </div>
  )
}
