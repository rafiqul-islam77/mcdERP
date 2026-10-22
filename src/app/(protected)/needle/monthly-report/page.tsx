import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function NeedleMonthlyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'needle.monthly_report.view')

  return (
    <ModulePlaceholder
      moduleName="Needle Management"
      pageName="Monthly Needle Report"
      permissionKey="needle.monthly_report.view"
      description="Monthly needle opening, closing, consumption, and carry-forward reports will be implemented in Phase 2."
    />
  )
}
