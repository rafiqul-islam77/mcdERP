import { PageSkeleton } from '@/components/ui/skeleton'

export default function EmployeesLoading() {
  return (
    <PageSkeleton
      title="Employees & Users"
      subtitle="Manage factory personnel, floor assignments, security credentials, and live statuses."
      hasButton={true}
      tableConfig={{
        rowCount: 8,
        headerLabels: [
          '',
          'EMPLOYEE ID',
          'STAFF NAME',
          'FLOOR',
          'EMAIL',
          'DESIGNATION',
          'ROLE',
          'STATUS',
          'ACCOUNT STATE',
          'PASSWORD',
          'ONE-TIME TOKEN',
          'LAST LOGIN',
        ],
        columnWidths: [
          '48px',
          '110px',
          '160px',
          '140px',
          '180px',
          '120px',
          '120px',
          '90px',
          '130px',
          '90px',
          '120px',
          '120px',
        ],
      }}
    />
  )
}
