'use server'

import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveEmployeeId, updateLastLogin } from '@/lib/auth'
import { verifyToken, consumeToken, revokeUserTokens } from '@/lib/tokens'
import { createAuditLog } from '@/lib/audit'
import { LoginSchema, ActivateSchema, SetPasswordSchema } from '@/lib/validation/schemas'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/types'

/**
 * Normal Employee ID + Password Login flow (§15)
 */
export async function loginAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const rawEmployeeId = formData.get('employeeId') as string
  const rawPassword = formData.get('password') as string

  // 1. Zod Validation
  const validation = LoginSchema.safeParse({
    employeeId: rawEmployeeId,
    password: rawPassword,
  })

  if (!validation.success) {
    return {
      success: false,
      error: 'Please provide both Employee ID and password.',
      fieldErrors: validation.error.flatten().fieldErrors,
    }
  }

  const { employeeId, password } = validation.data

  // 2. Server-side Employee ID resolution -> linked email
  let resolved: Awaited<ReturnType<typeof resolveEmployeeId>>
  try {
    resolved = await resolveEmployeeId(employeeId)
  } catch {
    return {
      success: false,
      error: 'Sign-in is temporarily unavailable. Please contact the administrator.',
    }
  }
  if (!resolved) {
    // Audit failure without leaking account existence
    await createAuditLog({
      eventType: 'LOGIN_FAILURE',
      metadata: { employee_id: employeeId, reason: 'unknown_employee_id' },
    })
    return {
      success: false,
      error: 'Invalid Employee ID or password.',
    }
  }

  // 3. Supabase Auth authentication using resolved email
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  })

  if (authError || !authData.user) {
    await createAuditLog({
      eventType: 'LOGIN_FAILURE',
      targetUserId: resolved.id,
      metadata: { employee_id: employeeId, reason: 'invalid_credentials' },
    })
    return {
      success: false,
      error: 'Invalid Employee ID or password.',
    }
  }

  // 4. Check profile account state (§6)
  if (resolved.accountState === 'disabled') {
    await supabase.auth.signOut()
    await createAuditLog({
      eventType: 'LOGIN_FAILURE',
      actorUserId: resolved.id,
      metadata: { reason: 'account_disabled' },
    })
    return {
      success: false,
      error: 'Your account is disabled. Contact the system administrator.',
    }
  }

  if (resolved.accountState === 'pending_activation') {
    await supabase.auth.signOut()
    return {
      success: false,
      error: 'Your account is pending activation. Please use your activation token.',
    }
  }

  if (resolved.accountState === 'credential_reset_required') {
    await supabase.auth.signOut()
    return {
      success: false,
      error: 'Your credentials have been reset. Use the recovery token provided by the Site Administrator.',
    }
  }

  // 5. Update last login timestamp & record audit
  await updateLastLogin(authData.user.id)
  await createAuditLog({
    eventType: 'LOGIN_SUCCESS',
    actorUserId: authData.user.id,
    targetUserId: authData.user.id,
    metadata: { employee_id: employeeId },
  })

  redirect('/dashboard')
}

/**
 * Logout action
 */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await createAuditLog({
      eventType: 'LOGOUT',
      actorUserId: user.id,
    })
  }

  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * Verify Activation Token (§22)
 */
export async function verifyActivationTokenAction(
  formData: FormData
): Promise<ActionResult<{ userId: string; tokenId: string; employeeId: string }>> {
  const rawEmployeeId = formData.get('employeeId') as string
  const rawToken = formData.get('token') as string

  const validation = ActivateSchema.safeParse({
    employeeId: rawEmployeeId,
    token: rawToken,
  })

  if (!validation.success) {
    return {
      success: false,
      error: 'Valid Employee ID and activation token are required.',
    }
  }

  const { employeeId, token } = validation.data
  let resolved: Awaited<ReturnType<typeof resolveEmployeeId>>
  try {
    resolved = await resolveEmployeeId(employeeId)
  } catch {
    return {
      success: false,
      error: 'Account activation is temporarily unavailable. Please contact the administrator.',
    }
  }

  if (!resolved) {
    return { success: false, error: 'Invalid Employee ID or token.' }
  }

  if (resolved.accountState === 'disabled') {
    return { success: false, error: 'Account is disabled. Contact system administrator.' }
  }

  const result = await verifyToken(resolved.id, token, 'activation')
  if (!result.valid || !result.tokenId) {
    return { success: false, error: 'Invalid, expired, or previously used activation token.' }
  }

  return {
    success: true,
    data: {
      userId: resolved.id,
      tokenId: result.tokenId,
      employeeId,
    },
  }
}

/**
 * Complete First-time Activation with New Password (§22)
 */
export async function completeActivationAction(
  userId: string,
  tokenId: string,
  formData: FormData
): Promise<ActionResult> {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  const validation = SetPasswordSchema.safeParse({ password, confirmPassword })
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors[0]?.message || 'Invalid password.',
    }
  }

  const admin = getAdminClient()

  // 1. Set password via Supabase Auth Admin
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password,
  })

  if (authError) {
    return { success: false, error: `Failed to set password: ${authError.message}` }
  }

  // 2. Consume one-time token (mark used, dispose encrypted payload)
  await consumeToken(tokenId)

  // 3. Revoke any other residual active tokens
  await revokeUserTokens(userId, 'activation')

  // 4. Update profile to active
  await admin
    .from('profiles')
    .update({
      account_state: 'active',
      must_set_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  // 5. Audit log
  await createAuditLog({
    eventType: 'ACTIVATION_COMPLETED',
    actorUserId: userId,
    targetUserId: userId,
  })

  return { success: true }
}

/**
 * Verify Password Recovery Token (§25)
 */
export async function verifyRecoveryTokenAction(
  formData: FormData
): Promise<ActionResult<{ userId: string; tokenId: string; employeeId: string }>> {
  const rawEmployeeId = formData.get('employeeId') as string
  const rawToken = formData.get('token') as string

  const validation = ActivateSchema.safeParse({
    employeeId: rawEmployeeId,
    token: rawToken,
  })

  if (!validation.success) {
    return { success: false, error: 'Valid Employee ID and recovery token required.' }
  }

  const { employeeId, token } = validation.data
  let resolved: Awaited<ReturnType<typeof resolveEmployeeId>>
  try {
    resolved = await resolveEmployeeId(employeeId)
  } catch {
    return {
      success: false,
      error: 'Password recovery is temporarily unavailable. Please contact the administrator.',
    }
  }

  if (!resolved) {
    return { success: false, error: 'Invalid Employee ID or token.' }
  }

  if (resolved.accountState === 'disabled') {
    return { success: false, error: 'Account is disabled. Contact system administrator.' }
  }

  const result = await verifyToken(resolved.id, token, 'recovery')
  if (!result.valid || !result.tokenId) {
    return { success: false, error: 'Invalid, expired, or previously used recovery token.' }
  }

  return {
    success: true,
    data: {
      userId: resolved.id,
      tokenId: result.tokenId,
      employeeId,
    },
  }
}

/**
 * Complete Password Recovery with New Password (§25)
 */
export async function completeRecoveryAction(
  userId: string,
  tokenId: string,
  formData: FormData
): Promise<ActionResult> {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  const validation = SetPasswordSchema.safeParse({ password, confirmPassword })
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors[0]?.message || 'Invalid password.',
    }
  }

  const admin = getAdminClient()

  // 1. Update Supabase Auth password
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password,
  })

  if (authError) {
    return { success: false, error: `Failed to reset password: ${authError.message}` }
  }

  // 2. Consume recovery token
  await consumeToken(tokenId)

  // 3. Revoke residual recovery tokens
  await revokeUserTokens(userId, 'recovery')

  // 4. Update profile to active
  await admin
    .from('profiles')
    .update({
      account_state: 'active',
      must_set_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  // 5. Audit log
  await createAuditLog({
    eventType: 'PASSWORD_RESET_COMPLETED',
    actorUserId: userId,
    targetUserId: userId,
  })

  return { success: true }
}
