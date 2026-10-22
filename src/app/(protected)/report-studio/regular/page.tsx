import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function ReportStudioRegularPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'report_studio.regular.view')

  return (
    <ModulePlaceholder
      moduleName="Report Studio"
      pageName="Regular Standard Reports"
      permissionKey="report_studio.regular.view"
      description="Standard pre-configured operational Excel and PDF reports will be implemented in Phase 2."
    />
  )
}
