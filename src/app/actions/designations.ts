'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { DesignationSchema } from '@/lib/validation/schemas'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

export async function createDesignationAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.designations.create')

  const parsed = DesignationSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description'),
    active: formData.get('active') === 'true' || formData.get('active') === 'on',
    sort_order: formData.get('sort_order'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid designation data.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { code, name, description, active, sort_order } = parsed.data
  const admin = getAdminClient()

  const { data: existing } = await admin
    .from('designations')
    .select('id')
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    return { success: false, error: `Designation "${name}" already exists.` }
  }

  const { data: newDes, error } = await admin
    .from('designations')
    .insert({
      code: code || null,
      name,
      description: description || null,
      active,
      sort_order,
    })
    .select('id')
    .single()

  if (error || !newDes) {
    return { success: false, error: `Failed to create designation: ${error?.message}` }
  }

  await createAuditLog({
    eventType: 'DESIGNATION_CREATED',
    actorUserId: actor.profile.id,
    entityType: 'designation',
    entityId: newDes.id,
    newData: { code, name, description, active, sort_order },
  })

  revalidatePath('/administration/designations')
  return { success: true }
}

export async function updateDesignationAction(id: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.designations.edit')

  const parsed = DesignationSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description'),
    active: formData.get('active') === 'true' || formData.get('active') === 'on',
    sort_order: formData.get('sort_order'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid designation data.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const admin = getAdminClient()
  const { data: existing } = await admin.from('designations').select('*').eq('id', id).single()
  if (!existing) {
    return { success: false, error: 'Designation not found.' }
  }

  const { error } = await admin
    .from('designations')
    .update({
      code: parsed.data.code || null,
      name: parsed.data.name,
      description: parsed.data.description || null,
      active: parsed.data.active,
      sort_order: parsed.data.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: `Failed to update designation: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'DESIGNATION_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'designation',
    entityId: id,
    oldData: existing,
    newData: parsed.data,
  })

  revalidatePath('/administration/designations')
  return { success: true }
}

export async function toggleDesignationActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.designations.edit')

  const admin = getAdminClient()
  const { error } = await admin
    .from('designations')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return { success: false, error: `Failed to update status: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'DESIGNATION_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'designation',
    entityId: id,
    metadata: { active },
  })

  revalidatePath('/administration/designations')
  return { success: true }
}
