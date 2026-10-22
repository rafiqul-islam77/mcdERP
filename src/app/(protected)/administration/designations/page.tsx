import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { DesignationManager } from '@/components/admin/designation-form'
import type { Designation } from '@/types'

export default async function DesignationsPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.designations.view')

  const admin = getAdminClient()
  const { data: designations } = await admin
    .from('designations')
    .select('*')
    .order('sort_order', { ascending: true })

  const [canCreate, canEdit] = await Promise.all([
    hasPermission(user.profile.id, 'admin.designations.create'),
    hasPermission(user.profile.id, 'admin.designations.edit'),
  ])

  return (
    <DesignationManager
      designations={(designations as Designation[]) || []}
      canCreate={canCreate}
      canEdit={canEdit}
    />
  )
}
