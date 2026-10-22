import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function IdleNeedleDailyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'idle.daily_report.view')

  return (
    <ModulePlaceholder
      moduleName="Idle Needle"
      pageName="Idle Needle Daily Report"
      permissionKey="idle.daily_report.view"
      description="Daily idle needle count and floor distributions will be implemented in Phase 2."
    />
  )
}
