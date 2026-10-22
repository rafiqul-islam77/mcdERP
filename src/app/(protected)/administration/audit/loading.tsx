import { PageSkeleton } from '@/components/ui/skeleton'

export default function AuditLoading() {
  return (
    <PageSkeleton
      title="Audit Log Trail"
      subtitle="Complete, tamper-evident security audit trail of all administrative and credential events."
      hasButton={false}
      tableConfig={{
        rowCount: 10,
        headerLabels: [
          'DATE / TIME',
          'ACTOR',
          'EVENT TYPE',
          'TARGET USER',
          'ENTITY',
          'SUMMARY / DETAILS',
        ],
        columnWidths: ['160px', '140px', '180px', '140px', '120px', 'auto'],
      }}
    />
  )
}
