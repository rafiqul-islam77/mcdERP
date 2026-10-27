import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { RoleEditor } from '@/components/admin/role-editor'
import type { Role, Permission } from '@/types'

export default async function RoleMatrixPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.roles.view')

  const { id } = await params
  const admin = getAdminClient()

  // 1. Fetch role
  const { data: role } = await admin.from('roles').select('*').eq('id', id).single()
  if (!role) {
    notFound()
  }

  // 2. Fetch all permissions catalog
  const { data: allPermissions } = await admin
    .from('permissions')
    .select('*')
    .order('module', { ascending: true })

  // 3. Fetch currently assigned permissions for this role
  const { data: rolePermissions } = await admin
    .from('role_permissions')
    .select('permissions(key)')
    .eq('role_id', id)

  const initialPermissionKeys: string[] = []
  for (const rp of rolePermissions || []) {
    const p = (rp.permissions as unknown) as { key: string } | null
    if (p && p.key) {
      initialPermissionKeys.push(p.key)
    }
  }

  const canEdit = await hasPermission(user.profile.id, 'admin.roles.edit')

  return (
    <RoleEditor
      role={role as Role}
      allPermissions={(allPermissions as Permission[]) || []}
      initialPermissionKeys={initialPermissionKeys}
      canEdit={canEdit}
    />
  )
}
