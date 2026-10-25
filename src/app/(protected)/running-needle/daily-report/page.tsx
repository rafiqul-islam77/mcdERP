import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Daily Report (Running Needle) | GMS ERP',
}

export default async function RunningNeedleDailyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'needle.daily_report.view')

  return (
    <ModulePlaceholder
      moduleName="Running Needle"
      pageName="Daily Needle Report"
      permissionKey="needle.daily_report.view"
      description="Daily floor-wise running needle consumption reports will be implemented in Phase 2.2."
    />
  )
}
