'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { RoleSchema } from '@/lib/validation/schemas'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

/**
 * Creates a new application role (§10).
 */
export async function createRoleAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.roles.create')

  const parsed = RoleSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid role details.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { name, description } = parsed.data
  const admin = getAdminClient()

  // Prevent creating role with reserved system name
  if (name.toLowerCase() === 'site admin') {
    return { success: false, error: '"Site Admin" is a protected system role name.' }
  }

  const { data: newRole, error } = await admin
    .from('roles')
    .insert({
      name,
      description: description || null,
      is_system: false,
      active: true,
    })
    .select('id')
    .single()

  if (error || !newRole) {
    return { success: false, error: `Failed to create role: ${error?.message}` }
  }

  await createAuditLog({
    eventType: 'ROLE_CREATED',
    actorUserId: actor.profile.id,
    entityType: 'role',
    entityId: newRole.id,
    newData: { name, description },
  })

  revalidatePath('/administration/roles')
  return { success: true, data: { id: newRole.id } }
}

/**
 * Updates role name and description (§10).
 */
export async function updateRoleAction(roleId: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.roles.edit')

  const parsed = RoleSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid role data.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const admin = getAdminClient()
  const { data: existingRole } = await admin.from('roles').select('*').eq('id', roleId).single()

  if (!existingRole) {
    return { success: false, error: 'Role not found.' }
  }

  // System roles cannot have their name renamed (§34)
  if (existingRole.is_system && parsed.data.name !== existingRole.name) {
    return { success: false, error: 'Protected system role names cannot be modified.' }
  }

  const { error } = await admin
    .from('roles')
    .update({
      name: existingRole.is_system ? existingRole.name : parsed.data.name,
      description: parsed.data.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roleId)

  if (error) {
    return { success: false, error: `Failed to update role: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'ROLE_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'role',
    entityId: roleId,
    oldData: { name: existingRole.name, description: existingRole.description },
    newData: parsed.data,
  })

  revalidatePath('/administration/roles')
  return { success: true }
}

/**
 * Updates permissions assigned to a role (§14).
 * Site Admin cannot have its permissions stripped (§34).
 */
export async function updateRolePermissionsAction(
  roleId: string,
  permissionKeys: string[]
): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.roles.edit')

  const admin = getAdminClient()
  const { data: role } = await admin.from('roles').select('id, name, is_system').eq('id', roleId).single()

  if (!role) {
    return { success: false, error: 'Role not found.' }
  }

  // Protection: Site Admin must always retain all permissions (§34)
  if (role.is_system && role.name === 'Site Admin') {
    return {
      success: false,
      error: 'Permissions for the Site Admin system role cannot be stripped or modified.',
    }
  }

  // Look up permission IDs matching provided keys
  const { data: matchingPerms } = await admin
    .from('permissions')
    .select('id, key')
    .in('key', permissionKeys)

  const permIds = (matchingPerms || []).map((p: { id: string }) => p.id)

  // 1. Delete existing role permissions
  await admin.from('role_permissions').delete().eq('role_id', roleId)

  // 2. Insert new permissions
  if (permIds.length > 0) {
    const rows = permIds.map((pid: string) => ({
      role_id: roleId,
      permission_id: pid,
    }))
    const { error: insertError } = await admin.from('role_permissions').insert(rows)
    if (insertError) {
      return { success: false, error: `Failed to save permissions: ${insertError.message}` }
    }
  }

  await createAuditLog({
    eventType: 'ROLE_PERMISSIONS_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'role',
    entityId: roleId,
    metadata: { roleName: role.name, assignedCount: permIds.length },
  })

  revalidatePath('/administration/roles')
  return { success: true }
}

/**
 * Deletes a custom role (§10).
 * System roles and roles with assigned users cannot be deleted (§34).
 */
export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.roles.delete')

  const admin = getAdminClient()
  const { data: role } = await admin.from('roles').select('id, name, is_system').eq('id', roleId).single()

  if (!role) {
    return { success: false, error: 'Role not found.' }
  }

  if (role.is_system) {
    return { success: false, error: 'Protected system roles cannot be deleted.' }
  }

  // Check if any employees are assigned to this role
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId)

  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `Cannot delete role: ${count} employee(s) are currently assigned to this role.`,
    }
  }

  // Delete role permissions and role
  await admin.from('role_permissions').delete().eq('role_id', roleId)
  const { error } = await admin.from('roles').delete().eq('id', roleId)

  if (error) {
    return { success: false, error: `Failed to delete role: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'ROLE_DELETED',
    actorUserId: actor.profile.id,
    entityType: 'role',
    entityId: roleId,
    oldData: { name: role.name },
  })

  revalidatePath('/administration/roles')
  return { success: true }
}
