import { Skeleton } from '@/components/ui/skeleton'

export default function RoleEditorLoading() {
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-erp" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-3.5 w-60 rounded" />
          </div>
        </div>
        <Skeleton className="h-9 w-36 rounded-erp" />
      </div>

      {/* Role Details */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-xs p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full rounded-erp" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full rounded-erp" />
        </div>
      </div>

      {/* Permission Matrix Tables */}
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-surface-border rounded-erp-lg shadow-xs overflow-hidden"
          >
            <div className="px-5 py-3 bg-slate-900 flex items-center justify-between">
              <Skeleton className="h-4 w-36 bg-slate-700" />
              <Skeleton className="h-3 w-20 bg-slate-700" />
            </div>
            <div className="p-4 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
