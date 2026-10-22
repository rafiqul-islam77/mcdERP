import { PageSkeleton } from '@/components/ui/skeleton'

export default function FloorsLoading() {
  return (
    <PageSkeleton
      title="Floor Master"
      subtitle="Manage factory production floors, line groupings, and building locations."
      hasButton={true}
      tableConfig={{
        rowCount: 8,
        headerLabels: [
          'CODE',
          'FLOOR NAME',
          'FLOOR LOCATION',
          'DESCRIPTION',
          'SORT ORDER',
          'STATUS',
          'ACTIONS',
        ],
        columnWidths: ['80px', '180px', '160px', 'auto', '90px', '90px', '90px'],
      }}
    />
  )
}
