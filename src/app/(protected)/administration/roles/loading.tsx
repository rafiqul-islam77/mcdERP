import { PageSkeleton } from '@/components/ui/skeleton'

export default function RolesLoading() {
  return (
    <PageSkeleton
      title="Roles & Permissions"
      subtitle="Manage security roles, access profiles, and granular permission matrices."
      hasButton={true}
      tableConfig={{
        rowCount: 5,
        headerLabels: [
          'ROLE NAME',
          'DESCRIPTION',
          'USERS COUNT',
          'SYSTEM ROLE',
          'ACTIVE',
          'ACTIONS',
        ],
        columnWidths: ['180px', 'auto', '120px', '120px', '90px', '90px'],
      }}
    />
  )
}
