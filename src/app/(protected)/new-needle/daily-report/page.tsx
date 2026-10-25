import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Daily Report (New Needle) | GMS ERP',
}

export default async function NewNeedleDailyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'broken.daily_report.view')

  return (
    <ModulePlaceholder
      moduleName="New Needle"
      pageName="Daily Needle Report"
      permissionKey="broken.daily_report.view"
      description="Daily floor-wise new needle consumption reports will be implemented in Phase 2.2."
    />
  )
}
