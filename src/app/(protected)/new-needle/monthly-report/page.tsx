import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Monthly Report (New Needle) | GMS ERP',
}

export default async function NewNeedleMonthlyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'broken.monthly_report.view')

  return (
    <ModulePlaceholder
      moduleName="New Needle"
      pageName="Monthly Needle Report"
      permissionKey="broken.monthly_report.view"
      description="Monthly new needle consolidated statements will be implemented in Phase 2.3."
    />
  )
}
