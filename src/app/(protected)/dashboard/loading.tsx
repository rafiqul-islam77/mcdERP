import { Skeleton, CardSkeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-40 rounded" />
        <Skeleton className="h-4 w-64 rounded" />
      </div>

      {/* Metric Cards Skeleton */}
      <CardSkeleton count={4} />

      {/* Lower Dashboard Section Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-surface-border">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs space-y-4">
          <Skeleton className="h-5 w-32 pb-3 border-b border-surface-border" />
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-erp" />
            <Skeleton className="h-14 w-full rounded-erp" />
            <Skeleton className="h-14 w-full rounded-erp" />
          </div>
        </div>
      </div>
    </div>
  )
}
