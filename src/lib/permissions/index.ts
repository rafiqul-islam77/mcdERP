import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { PermissionKey } from './keys'

/**
 * Retrieve all active permission keys for a given profile ID.
 */
export async function getUserPermissions(profileId: string): Promise<string[]> {
  const supabase = await createClient()

  // First fetch the user's role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role_id, roles(id, name, is_system, active)')
    .eq('id', profileId)
    .single()

  if (!profile || !profile.role_id) {
    return []
  }

  // If role is inactive, grant no permissions
  const role = (profile.roles as unknown) as { id: string; name: string; is_system: boolean; active: boolean } | null
  if (!role || !role.active) {
    return []
  }

  // If Site Admin, grant all permissions
  if (role.is_system && role.name === 'Site Admin') {
    const { data: allPerms } = await supabase
      .from('permissions')
      .select('key')
    return (allPerms || []).map((p: any) => p.key)
  }

  // Otherwise, fetch role_permissions
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('permissions(key)')
    .eq('role_id', profile.role_id)

  if (!rolePerms) return []

  const perms: string[] = []
  for (const rp of rolePerms) {
    const p = (rp.permissions as unknown) as { key: string } | null
    if (p && p.key) {
      perms.push(p.key)
    }
  }

  return perms
}

/**
 * Check if a profile holds a specific permission key.
 */
export async function hasPermission(profileId: string, key: PermissionKey | string): Promise<boolean> {
  const permissions = await getUserPermissions(profileId)
  return permissions.includes(key)
}

/**
 * Check if the profile is assigned to the protected Site Admin role.
 */
export async function isSiteAdmin(profileId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('roles(is_system, name)')
    .eq('id', profileId)
    .single()

  const role = (profile?.roles as unknown) as { is_system: boolean; name: string } | null
  return Boolean(role?.is_system && role?.name === 'Site Admin')
}

/**
 * Guard: throws redirect to /unauthorized if the user lacks the required permission.
 */
export async function requirePermission(profileId: string, key: PermissionKey | string): Promise<void> {
  const allowed = await hasPermission(profileId, key)
  if (!allowed) {
    redirect('/unauthorized')
  }
}
