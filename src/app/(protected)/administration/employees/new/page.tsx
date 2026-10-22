import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { AddEmployeeClient } from './_components/add-employee-client'
import type { Floor, Designation, Role } from '@/types'

export default async function AddEmployeePage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.users.create')

  const admin = getAdminClient()

  // Only active floors and designations appear in dropdowns (§8, §9)
  const { data: floors } = await admin
    .from('floors')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const { data: designations } = await admin
    .from('designations')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const { data: roles } = await admin
    .from('roles')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })

  return (
    <AddEmployeeClient
      floors={(floors as Floor[]) || []}
      designations={(designations as Designation[]) || []}
      roles={(roles as Role[]) || []}
    />
  )
}
