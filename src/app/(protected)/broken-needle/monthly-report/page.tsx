import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function BrokenNeedleMonthlyReportPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'broken.monthly_report.view')

  return (
    <ModulePlaceholder
      moduleName="Broken Needle"
      pageName="Broken Needle Monthly Report"
      permissionKey="broken.monthly_report.view"
      description="Monthly broken needle breakage rate analytics and trend summaries will be implemented in Phase 2."
    />
  )
}
