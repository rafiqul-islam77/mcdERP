import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Monthly Report (Running Needle) | GMS ERP',
}

export default async function RunningNeedleMonthlyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'needle.monthly_report.view')

  return (
    <ModulePlaceholder
      moduleName="Running Needle"
      pageName="Monthly Needle Report"
      permissionKey="needle.monthly_report.view"
      description="Monthly running needle consolidated statements will be implemented in Phase 2.3."
    />
  )
}
