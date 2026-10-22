import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function NeedleDailyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'needle.daily_report.view')

  return (
    <ModulePlaceholder
      moduleName="Needle Management"
      pageName="Daily Needle Report"
      permissionKey="needle.daily_report.view"
      description="Daily floor-wise and line-wise needle consumption reports will be implemented in Phase 2."
    />
  )
}
