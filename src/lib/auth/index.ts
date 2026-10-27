import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { getUserPermissions, isSiteAdmin as checkIsSiteAdmin } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import type { CurrentUser, ProfileWithRelations } from '@/types'

/**
 * Returns basic Supabase authenticated user.
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Returns full profile record joined with designations, roles, floors.
 */
export async function getCurrentProfile(): Promise<ProfileWithRelations | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      *,
      designations:designation_id(id, name, code),
      roles:role_id(id, name, is_system),
      floors:floor_id(id, name, code)
    `)
    .eq('id', user.id)
    .single()

  if (!profile) return null

  const p = profile as unknown as ProfileWithRelations
  const floorIds: string[] = Array.isArray(p.floor_ids) && p.floor_ids.length > 0
    ? (p.floor_ids as string[])
    : (p.floor_id ? [p.floor_id] : [])

  if (floorIds.length > 0) {
    const { data: assignedFloors } = await supabase
      .from('floors')
      .select('id, name, code')
      .in('id', floorIds)
      .order('sort_order', { ascending: true })

    p.assigned_floors = assignedFloors || []
  } else {
    p.assigned_floors = []
  }

  return p
}

/**
 * Returns full context: user, profile, permissions, and site admin flag.
 */
export async function getCurrentUserFull(): Promise<CurrentUser | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const profile = await getCurrentProfile()
  if (!profile) return null

  const permissions = await getUserPermissions(profile.id)
  const isSiteAdmin = await checkIsSiteAdmin(profile.id)

  return {
    id: user.id,
    email: user.email || profile.email,
    profile,
    permissions,
    isSiteAdmin,
  }
}

/**
 * Route protection: requires authenticated session.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const current = await getCurrentUserFull()
  if (!current) {
    redirect('/login')
  }
  return current
}

/**
 * Route protection: requires active account state.
 * Directs pending_activation, credential_reset_required, or disabled accounts appropriately.
 */
export async function requireActiveAccount(): Promise<CurrentUser> {
  const current = await requireAuth()

  if (current.profile.account_state === 'disabled') {
    redirect('/login?error=disabled')
  }

  if (current.profile.account_state === 'pending_activation') {
    redirect('/activate')
  }

  if (current.profile.account_state === 'credential_reset_required') {
    redirect('/recover')
  }

  return current
}

/**
 * Resolves an Employee ID to their associated Auth email server-side.
 * Used during login so users enter Employee ID instead of email.
 */
export async function resolveEmployeeId(employeeId: string): Promise<{ id: string; email: string; accountState: string } | null> {
  const admin = getAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, account_state')
    .ilike('employee_id', employeeId.trim())
    .maybeSingle()

  if (error) {
    console.error('[auth] Employee lookup failed:', error.code, error.message)
    throw new Error('Employee lookup unavailable')
  }

  if (!profile) return null

  return {
    id: profile.id,
    email: profile.email,
    accountState: profile.account_state,
  }
}

/**
 * Updates last_login_at timestamp.
 */
export async function updateLastLogin(userId: string): Promise<void> {
  try {
    const admin = getAdminClient()
    await admin
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId)
  } catch (err) {
    console.error('Failed to update last login:', err)
  }
}

/**
 * Heartbeat: updates last_seen_at timestamp.
 */
export async function updateLastSeen(userId: string): Promise<void> {
  try {
    const admin = getAdminClient()
    await admin
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId)
  } catch (err) {
    console.error('Failed to update last seen:', err)
  }
}
