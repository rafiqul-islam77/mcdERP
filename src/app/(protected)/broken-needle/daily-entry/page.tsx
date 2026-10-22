import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function BrokenNeedleDailyEntryPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'broken.daily_entry.view')

  return (
    <ModulePlaceholder
      moduleName="Broken Needle"
      pageName="Broken Needle Daily Entry"
      permissionKey="broken.daily_entry.view"
      description="Broken needle return verification, point inspection, and exchange workflows will be implemented in Phase 2."
    />
  )
}
