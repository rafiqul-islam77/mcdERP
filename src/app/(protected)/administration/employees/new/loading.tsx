import { Skeleton } from '@/components/ui/skeleton'

export default function NewEmployeeLoading() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-1 pb-2 border-b border-surface-border">
        <Skeleton className="h-7 w-48 rounded" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>

      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-erp" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-erp" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-full rounded-erp" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-erp" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-erp" />
          </div>
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-28 w-full rounded-erp" />
        </div>
      </div>
    </div>
  )
}
