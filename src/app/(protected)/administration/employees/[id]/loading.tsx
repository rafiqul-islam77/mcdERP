import { Skeleton } from '@/components/ui/skeleton'

export default function EmployeeDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-erp" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-3.5 w-60 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-erp" />
          <Skeleton className="h-8 w-32 rounded-erp" />
        </div>
      </div>

      {/* Meta Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-erp-lg bg-white border border-surface-border shadow-xs">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>

      {/* Details Box */}
      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
