'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { createToken, revealToken, revokeUserTokens } from '@/lib/tokens'
import { createAuditLog } from '@/lib/audit'
import { CreateEmployeeSchema, UpdateEmployeeSchema } from '@/lib/validation/schemas'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'
import type { ActionResult, TokenRevealResult } from '@/types'

/**
 * Creates a new employee with Supabase Auth identity, profile, and initial activation token (§21).
 */
export async function createEmployeeAction(
  formData: FormData
): Promise<ActionResult<{ tokenPlaintext: string; employeeId: string; name: string }>> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.users.create')

  // Extract floor_ids (support multiple checkboxes or single floor_id)
  const rawFloorIds = formData.getAll('floor_ids') as string[]
  let floorIds = rawFloorIds.filter(Boolean)
  if (floorIds.length === 0) {
    const singleFloor = formData.get('floor_id') as string
    if (singleFloor) floorIds = [singleFloor]
  }

  const parsed = CreateEmployeeSchema.safeParse({
    employee_id: formData.get('employee_id'),
    name: formData.get('name'),
    email: formData.get('email'),
    designation_id: formData.get('designation_id'),
    role_id: formData.get('role_id'),
    floor_ids: floorIds.length > 0 ? floorIds : undefined,
    floor_id: floorIds[0] || undefined,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Please correct the invalid fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { employee_id, name, email, designation_id, role_id, floor_id } = parsed.data
  const admin = getAdminClient()

  // Verify unique employee_id and email in profiles
  const { data: existing } = await admin
    .from('profiles')
    .select('id, employee_id, email')
    .or(`employee_id.eq.${employee_id},email.eq.${email}`)
    .maybeSingle()

  if (existing) {
    if (existing.employee_id.toUpperCase() === employee_id.toUpperCase()) {
      return { success: false, error: `Employee ID "${employee_id}" is already registered.` }
    }
    return { success: false, error: `Email address "${email}" is already registered.` }
  }

  // 1. Create Supabase Auth identity server-side
  // Temporary high-entropy password that will be replaced when user sets password
  const tempPassword = randomBytes(24).toString('hex')
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { employee_id, name },
  })

  if (authError || !authUser.user) {
    return { success: false, error: `Failed to create auth user: ${authError?.message}` }
  }

  const newUserId = authUser.user.id

  // 2. Insert Profile record
  const profileInsertPayload: Record<string, any> = {
    id: newUserId,
    employee_id,
    name,
    email,
    designation_id,
    role_id,
    floor_id: floorIds[0] || null,
    floor_ids: floorIds,
    account_state: 'pending_activation',
    must_set_password: true,
    created_by: actor.profile.id,
  }

  let { error: profileError } = await admin.from('profiles').insert(profileInsertPayload)

  // Fallback if floor_ids column does not exist on profiles yet
  if (profileError && profileError.message?.includes('floor_ids')) {
    delete profileInsertPayload.floor_ids
    const fallback = await admin.from('profiles').insert(profileInsertPayload)
    profileError = fallback.error
  }

  if (profileError) {
    // Rollback auth user
    await admin.auth.admin.deleteUser(newUserId)
    return { success: false, error: `Failed to create profile: ${profileError.message}` }
  }

  // 3. Issue Encrypted One-Time Activation Token
  const { tokenPlaintext } = await createToken(newUserId, 'activation', actor.profile.id)

  // 4. Record Audit entries (NEVER log the token value itself)
  await createAuditLog({
    eventType: 'USER_CREATED',
    actorUserId: actor.profile.id,
    targetUserId: newUserId,
    entityType: 'profile',
    entityId: newUserId,
    newData: { employee_id, name, email, designation_id, role_id, floor_id },
  })

  await createAuditLog({
    eventType: 'ACTIVATION_TOKEN_CREATED',
    actorUserId: actor.profile.id,
    targetUserId: newUserId,
    entityType: 'user_access_token',
    metadata: { employee_id, purpose: 'activation' },
  })

  revalidatePath('/administration/employees')

  return {
    success: true,
    data: { tokenPlaintext, employeeId: employee_id, name },
  }
}

/**
 * Updates an employee's profile data (§51).
 */
export async function updateEmployeeAction(
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.users.edit')

  // Extract floor_ids (support multiple checkboxes or single floor_id)
  const rawFloorIds = formData.getAll('floor_ids') as string[]
  let floorIds = rawFloorIds.filter(Boolean)
  if (floorIds.length === 0) {
    const singleFloor = formData.get('floor_id') as string
    if (singleFloor) floorIds = [singleFloor]
  }

  const parsed = UpdateEmployeeSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    designation_id: formData.get('designation_id'),
    role_id: formData.get('role_id'),
    floor_ids: floorIds.length > 0 ? floorIds : undefined,
    floor_id: floorIds[0] || undefined,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Please fill in all required fields correctly.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const admin = getAdminClient()

  // Fetch current target user profile
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('*, roles(id, name, is_system)')
    .eq('id', userId)
    .single()

  if (!targetProfile) {
    return { success: false, error: 'Employee not found.' }
  }

  // Protection: if changing role of Site Admin, ensure target is not the LAST active Site Admin (§34)
  const isTargetSiteAdmin = targetProfile.roles?.is_system && targetProfile.roles?.name === 'Site Admin'
  if (isTargetSiteAdmin && parsed.data.role_id !== targetProfile.role_id) {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', targetProfile.role_id)
      .eq('account_state', 'active')

    if ((count ?? 0) <= 1) {
      return {
        success: false,
        error: 'Cannot remove Site Admin role: this is the final active Site Admin in the system.',
      }
    }
  }

  // Update profile
  const profileUpdatePayload: Record<string, any> = {
    name: parsed.data.name,
    email: parsed.data.email,
    designation_id: parsed.data.designation_id,
    role_id: parsed.data.role_id,
    floor_id: floorIds[0] || null,
    floor_ids: floorIds,
    updated_by: actor.profile.id,
    updated_at: new Date().toISOString(),
  }

  let { error: updateError } = await admin
    .from('profiles')
    .update(profileUpdatePayload)
    .eq('id', userId)

  // Fallback if floor_ids column does not exist on profiles yet
  if (updateError && updateError.message?.includes('floor_ids')) {
    delete profileUpdatePayload.floor_ids
    const fallback = await admin
      .from('profiles')
      .update(profileUpdatePayload)
      .eq('id', userId)
    updateError = fallback.error
  }

  if (updateError) {
    return { success: false, error: `Failed to update employee: ${updateError.message}` }
  }

  // Update auth email if modified
  if (parsed.data.email !== targetProfile.email) {
    await admin.auth.admin.updateUserById(userId, { email: parsed.data.email })
  }

  await createAuditLog({
    eventType: 'USER_UPDATED',
    actorUserId: actor.profile.id,
    targetUserId: userId,
    entityType: 'profile',
    entityId: userId,
    oldData: {
      name: targetProfile.name,
      email: targetProfile.email,
      role_id: targetProfile.role_id,
      designation_id: targetProfile.designation_id,
      floor_id: targetProfile.floor_id,
    },
    newData: parsed.data,
  })

  revalidatePath('/administration/employees')
  return { success: true }
}

/**
 * Toggles an employee's active vs disabled state (§30).
 */
export async function toggleEmployeeDisabledAction(
  userId: string,
  disable: boolean
): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.users.disable')

  // Cannot disable self
  if (userId === actor.profile.id) {
    return { success: false, error: 'You cannot disable your own administrator account.' }
  }

  const admin = getAdminClient()
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('*, roles(is_system, name)')
    .eq('id', userId)
    .single()

  if (!targetProfile) {
    return { success: false, error: 'Employee not found.' }
  }

  // Protection: Cannot disable the final active Site Admin (§34)
  if (disable && targetProfile.roles?.is_system && targetProfile.roles?.name === 'Site Admin') {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', targetProfile.role_id)
      .eq('account_state', 'active')

    if ((count ?? 0) <= 1) {
      return {
        success: false,
        error: 'Cannot disable account: this is the final active Site Admin in the system.',
      }
    }
  }

  const newState = disable ? 'disabled' : 'active'
  const { error } = await admin
    .from('profiles')
    .update({
      account_state: newState,
      updated_by: actor.profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    return { success: false, error: `Failed to update status: ${error.message}` }
  }

  if (disable) {
    // Revoke any active tokens when disabling account
    await revokeUserTokens(userId)
  }

  await createAuditLog({
    eventType: disable ? 'USER_DISABLED' : 'USER_ENABLED',
    actorUserId: actor.profile.id,
    targetUserId: userId,
    entityType: 'profile',
    entityId: userId,
  })

  revalidatePath('/administration/employees')
  return { success: true }
}

/**
 * Resets employee credentials and generates a recovery token (§24).
 */
export async function resetCredentialsAction(
  userId: string
): Promise<ActionResult<{ recoveryToken: string; employeeId: string; name: string }>> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.users.reset_credentials')

  const admin = getAdminClient()
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (!targetProfile) {
    return { success: false, error: 'Employee not found.' }
  }

  // 1. Invalidate old password with random temporary string
  const tempPassword = randomBytes(24).toString('hex')
  await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  })

  // 2. Revoke all previous active tokens
  await revokeUserTokens(userId)

  // 3. Mark profile credential_reset_required
  await admin
    .from('profiles')
    .update({
      account_state: 'credential_reset_required',
      must_set_password: true,
      updated_by: actor.profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  // 4. Generate new encrypted recovery token
  const { tokenPlaintext } = await createToken(userId, 'recovery', actor.profile.id)

  // 5. Audit log (NEVER store token in audit)
  await createAuditLog({
    eventType: 'CREDENTIAL_RESET_REQUIRED',
    actorUserId: actor.profile.id,
    targetUserId: userId,
    entityType: 'profile',
    metadata: { employee_id: targetProfile.employee_id },
  })

  await createAuditLog({
    eventType: 'RECOVERY_TOKEN_CREATED',
    actorUserId: actor.profile.id,
    targetUserId: userId,
    metadata: { employee_id: targetProfile.employee_id, purpose: 'recovery' },
  })

  revalidatePath('/administration/employees')

  return {
    success: true,
    data: {
      recoveryToken: tokenPlaintext,
      employeeId: targetProfile.employee_id,
      name: targetProfile.name,
    },
  }
}

/**
 * Reveals an active one-time token for an authorized administrator (§19).
 */
export async function revealTokenAction(
  userId: string
): Promise<ActionResult<TokenRevealResult>> {
  const actor = await requireActiveAccount()
  const canView = await hasPermission(actor.profile.id, 'admin.users.view_token')

  if (!canView) {
    return { success: false, error: 'Unauthorized: Missing admin.users.view_token permission.' }
  }

  const admin = getAdminClient()

  // Find active token record
  const { data: tokenRecord } = await admin
    .from('user_access_tokens')
    .select('id, purpose, expires_at, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tokenRecord) {
    return { success: false, error: 'No active token found for this employee.' }
  }

  // Decrypt token server-side
  const plaintext = await revealToken(userId, tokenRecord.purpose as 'activation' | 'recovery')
  if (!plaintext) {
    return { success: false, error: 'Failed to decrypt token.' }
  }

  // Record audit of token reveal (WITHOUT token value)
  await createAuditLog({
    eventType: tokenRecord.purpose === 'activation' ? 'ACTIVATION_TOKEN_REVEALED' : 'RECOVERY_TOKEN_REVEALED',
    actorUserId: actor.profile.id,
    targetUserId: userId,
    entityType: 'user_access_token',
    entityId: tokenRecord.id,
    metadata: { purpose: tokenRecord.purpose },
  })

  return {
    success: true,
    data: {
      token: plaintext,
      purpose: tokenRecord.purpose as 'activation' | 'recovery',
      expiresAt: tokenRecord.expires_at,
    },
  }
}

/**
 * Automatically updates an employee's assigned floors directly from the table.
 */
export async function updateEmployeeFloorsAction(
  userId: string,
  floorIds: string[]
): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.users.edit')

  const admin = getAdminClient()

  // Verify target user exists
  const { data: targetProfile, error: targetError } = await admin
    .from('profiles')
    .select('id, employee_id, name, floor_id, floor_ids')
    .eq('id', userId)
    .single()

  if (targetError || !targetProfile) {
    return { success: false, error: 'Employee not found.' }
  }

  const profileUpdatePayload: Record<string, any> = {
    floor_id: floorIds[0] || null,
    floor_ids: floorIds,
    updated_by: actor.profile.id,
    updated_at: new Date().toISOString(),
  }

  let { error: updateError } = await admin
    .from('profiles')
    .update(profileUpdatePayload)
    .eq('id', userId)

  // Fallback if floor_ids column does not exist on profiles yet
  if (updateError && updateError.message?.includes('floor_ids')) {
    delete profileUpdatePayload.floor_ids
    const fallback = await admin
      .from('profiles')
      .update(profileUpdatePayload)
      .eq('id', userId)
    updateError = fallback.error
  }

  if (updateError) {
    return { success: false, error: `Failed to update floors: ${updateError.message}` }
  }

  await createAuditLog({
    eventType: 'USER_UPDATED',
    actorUserId: actor.profile.id,
    targetUserId: userId,
    entityType: 'profile',
    entityId: userId,
    oldData: { floor_ids: targetProfile.floor_ids, floor_id: targetProfile.floor_id },
    newData: { floor_ids: floorIds, floor_id: floorIds[0] || null },
    metadata: { action: 'inline_floor_update', employee_id: targetProfile.employee_id },
  })

  revalidatePath('/administration/employees')
  return { success: true }
}
