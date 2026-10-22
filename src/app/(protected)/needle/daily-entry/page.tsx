import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function NeedleDailyEntryPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'needle.daily_entry.view')

  return (
    <ModulePlaceholder
      moduleName="Needle Management"
      pageName="Daily Needle Entry"
      permissionKey="needle.daily_entry.view"
      description="Daily needle issue, return, receipt, and floor transfer operations will be implemented in Phase 2."
    />
  )
}
