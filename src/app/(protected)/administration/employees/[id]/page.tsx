import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { EmployeeDetailClient } from './_components/employee-detail-client'
import type { Floor, Designation, Role, ProfileWithRelations } from '@/types'

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.users.view')

  const { id } = await params
  const { edit } = await searchParams
  const isEditMode = edit === 'true'

  const admin = getAdminClient()

  // Fetch employee record with relations
  const { data: employee } = await admin
    .from('profiles')
    .select(`
      *,
      designations:designation_id(id, name, code),
      roles:role_id(id, name, is_system),
      floors:floor_id(id, name, code)
    `)
    .eq('id', id)
    .single()

  if (!employee) {
    notFound()
  }

  // Fetch active floors, designations, roles for edit dropdowns
  const { data: floors } = await admin
    .from('floors')
    .select('*')
    .order('sort_order', { ascending: true })

  const { data: designations } = await admin
    .from('designations')
    .select('*')
    .order('sort_order', { ascending: true })

  const { data: roles } = await admin
    .from('roles')
    .select('*')
    .order('name', { ascending: true })

  // Check permissions
  const [canEdit, canDisable, canResetCredentials, canViewToken] = await Promise.all([
    hasPermission(user.profile.id, 'admin.users.edit'),
    hasPermission(user.profile.id, 'admin.users.disable'),
    hasPermission(user.profile.id, 'admin.users.reset_credentials'),
    hasPermission(user.profile.id, 'admin.users.view_token'),
  ])

  return (
    <EmployeeDetailClient
      employee={employee as ProfileWithRelations}
      floors={(floors as Floor[]) || []}
      designations={(designations as Designation[]) || []}
      roles={(roles as Role[]) || []}
      initialEditMode={isEditMode && canEdit}
      canEdit={canEdit}
      canDisable={canDisable}
      canResetCredentials={canResetCredentials}
      canViewToken={canViewToken}
    />
  )
}
