import { TableSkeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <TableSkeleton columnCount={11} rowCount={10} showToolbar={true} />
    </div>
  )
}
