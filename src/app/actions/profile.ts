'use server'

import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { ProfileUpdateSchema } from '@/lib/validation/schemas'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()

  const parsed = ProfileUpdateSchema.safeParse({
    name: formData.get('name'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Please provide a valid name.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { name } = parsed.data
  const admin = getAdminClient()

  const { error } = await admin
    .from('profiles')
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actor.profile.id)

  if (error) {
    return { success: false, error: `Failed to update profile: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'PROFILE_UPDATED',
    actorUserId: actor.profile.id,
    targetUserId: actor.profile.id,
    entityType: 'profile',
    oldData: { name: actor.profile.name },
    newData: { name },
  })

  revalidatePath('/profile')
  return { success: true }
}

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' }
  }

  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { success: false, error: `Failed to change password: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'PASSWORD_RESET_COMPLETED',
    actorUserId: actor.profile.id,
    targetUserId: actor.profile.id,
    metadata: { self_service: true },
  })

  return { success: true }
}
