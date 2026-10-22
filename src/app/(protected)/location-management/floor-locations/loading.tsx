import { PageSkeleton } from '@/components/ui/skeleton'

export default function FloorLocationsLoading() {
  return (
    <PageSkeleton
      title="Floor Locations Master"
      subtitle="Manage factory buildings and physical locations to which floors are assigned."
      hasButton={true}
      tableConfig={{
        rowCount: 8,
        headerLabels: [
          'CODE',
          'LOCATION / BUILDING NAME',
          'DESCRIPTION',
          'SORT ORDER',
          'STATUS',
          'ACTIONS',
        ],
        columnWidths: ['90px', '220px', 'auto', '90px', '90px', '90px'],
      }}
    />
  )
}
