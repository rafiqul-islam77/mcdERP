import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ModulePlaceholder } from '@/components/layout/module-placeholder'

export default async function IdleNeedleDailyEntryPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'idle.daily_entry.view')

  return (
    <ModulePlaceholder
      moduleName="Idle Needle"
      pageName="Idle Needle Daily Entry"
      permissionKey="idle.daily_entry.view"
      description="Idle machine needle tracking and reallocation entries will be implemented in Phase 2."
    />
  )
}
