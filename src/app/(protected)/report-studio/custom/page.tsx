import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function ReportStudioCustomPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'report_studio.custom.view')

  return (
    <ModulePlaceholder
      moduleName="Report Studio"
      pageName="Dynamic Custom Reports Builder"
      permissionKey="report_studio.custom.view"
      description="Dynamic custom report designer, field selector, filters, and custom export engine will be implemented in Phase 2."
    />
  )
}
