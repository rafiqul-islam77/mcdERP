import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { EmployeeTable } from '@/components/admin/employee-table'
import type { EmployeeRow, Floor, Designation, Role } from '@/types'

export default async function EmployeesPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.users.view')

  const admin = getAdminClient()

  // 1. Fetch filter options first (floors, designations, roles)
  const [{ data: floors }, { data: designations }, { data: roles }] = await Promise.all([
    admin.from('floors').select('*').order('sort_order', { ascending: true }),
    admin.from('designations').select('*').order('sort_order', { ascending: true }),
    admin.from('roles').select('*').order('name', { ascending: true }),
  ])

  // 2. Fetch all profiles with relations
  const { data: profilesData } = await admin
    .from('profiles')
    .select(`
      *,
      designations:designation_id(name),
      roles:role_id(name, is_system),
      floors:floor_id(id, name, code)
    `)
    .order('created_at', { ascending: false })

  // 3. Fetch all active tokens to know which users have an active token (§19, §28)
  const { data: activeTokens } = await admin
    .from('user_access_tokens')
    .select('user_id')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())

  const activeTokenUserIds = new Set((activeTokens || []).map((t: { user_id: string }) => t.user_id))

  // 4. Map to EmployeeRow format with multi-floor resolution
  const allFloorsList = (floors as Floor[]) || []
  const employees: EmployeeRow[] = (profilesData || []).map((p: any) => {
    // Resolve assigned floor IDs (support array floor_ids or single floor_id)
    const assignedIds: string[] = Array.isArray(p.floor_ids) && p.floor_ids.length > 0
      ? p.floor_ids
      : (p.floor_id ? [p.floor_id] : [])

    let floorDisplay: string | null = null
    if (assignedIds.length > 0 && allFloorsList.length > 0) {
      if (assignedIds.length >= allFloorsList.length && allFloorsList.length > 1) {
        floorDisplay = 'All Floors'
      } else {
        const matchedCodes = assignedIds
          .map((id) => {
            const f = allFloorsList.find((fl) => fl.id === id)
            return f ? (f.code || f.name) : null
          })
          .filter(Boolean) as string[]

        floorDisplay = matchedCodes.length > 0 ? matchedCodes.join(', ') : (p.floors?.code || p.floors?.name || null)
      }
    } else {
      floorDisplay = p.floors?.code || p.floors?.name || null
    }

    return {
      id: p.id,
      employee_id: p.employee_id,
      name: p.name,
      email: p.email,
      designation: p.designations?.name || null,
      role: p.roles?.name || null,
      floor: floorDisplay,
      floor_ids: assignedIds,
      account_state: p.account_state,
      must_set_password: p.must_set_password,
      last_login_at: p.last_login_at,
      last_seen_at: p.last_seen_at,
      has_active_token: activeTokenUserIds.has(p.id),
      role_is_system: Boolean(p.roles?.is_system),
    }
  })

  // 5. Evaluate actor permissions
  const [canCreate, canEdit, canDisable, canResetCredentials, canViewToken] = await Promise.all([
    hasPermission(user.profile.id, 'admin.users.create'),
    hasPermission(user.profile.id, 'admin.users.edit'),
    hasPermission(user.profile.id, 'admin.users.disable'),
    hasPermission(user.profile.id, 'admin.users.reset_credentials'),
    hasPermission(user.profile.id, 'admin.users.view_token'),
  ])

  return (
    <EmployeeTable
      initialEmployees={employees}
      floors={(floors as Floor[]) || []}
      designations={(designations as Designation[]) || []}
      roles={(roles as Role[]) || []}
      canCreate={canCreate}
      canEdit={canEdit}
      canDisable={canDisable}
      canResetCredentials={canResetCredentials}
      canViewToken={canViewToken}
    />
  )
}
