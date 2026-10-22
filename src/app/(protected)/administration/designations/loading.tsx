import { PageSkeleton } from '@/components/ui/skeleton'

export default function DesignationsLoading() {
  return (
    <PageSkeleton
      title="Designations Master"
      subtitle="Manage factory employee designations and job titles."
      hasButton={true}
      tableConfig={{
        rowCount: 7,
        headerLabels: [
          'CODE',
          'DESIGNATION NAME',
          'DESCRIPTION',
          'SORT ORDER',
          'STATUS',
          'ACTIONS',
        ],
        columnWidths: ['90px', '200px', 'auto', '90px', '90px', '90px'],
      }}
    />
  )
}
