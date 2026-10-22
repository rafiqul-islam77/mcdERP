import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function IdleNeedleMonthlyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'idle.monthly_report.view')

  return (
    <ModulePlaceholder
      moduleName="Idle Needle"
      pageName="Idle Needle Monthly Report"
      permissionKey="idle.monthly_report.view"
      description="Monthly idle needle audits and machine utilization reports will be implemented in Phase 2."
    />
  )
}
