'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { FloorSchema } from '@/lib/validation/schemas'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

export async function createFloorAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.floors.create')

  const parsed = FloorSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    floor_location_id: formData.get('floor_location_id'),
    description: formData.get('description'),
    active: formData.get('active') === 'true' || formData.get('active') === 'on',
    sort_order: formData.get('sort_order'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid floor data.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { code, name, floor_location_id, description, active, sort_order } = parsed.data
  const admin = getAdminClient()

  // Verify unique name
  const { data: existing } = await admin
    .from('floors')
    .select('id')
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    return { success: false, error: `Floor "${name}" already exists.` }
  }

  const { data: newFloor, error } = await admin
    .from('floors')
    .insert({
      code: code || null,
      name,
      floor_location_id,
      description: description || null,
      active,
      sort_order,
    })
    .select('id')
    .single()

  if (error || !newFloor) {
    return { success: false, error: `Failed to create floor: ${error?.message}` }
  }

  await createAuditLog({
    eventType: 'FLOOR_CREATED',
    actorUserId: actor.profile.id,
    entityType: 'floor',
    entityId: newFloor.id,
    newData: { code, name, floor_location_id, description, active, sort_order },
  })

  revalidatePath('/location-management/floors')
  revalidatePath('/administration/floors')
  return { success: true }
}

export async function updateFloorAction(floorId: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.floors.edit')

  const parsed = FloorSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    floor_location_id: formData.get('floor_location_id'),
    description: formData.get('description'),
    active: formData.get('active') === 'true' || formData.get('active') === 'on',
    sort_order: formData.get('sort_order'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid floor data.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const admin = getAdminClient()
  const { data: existing } = await admin.from('floors').select('*').eq('id', floorId).single()
  if (!existing) {
    return { success: false, error: 'Floor not found.' }
  }

  const { error } = await admin
    .from('floors')
    .update({
      code: parsed.data.code || null,
      name: parsed.data.name,
      floor_location_id: parsed.data.floor_location_id,
      description: parsed.data.description || null,
      active: parsed.data.active,
      sort_order: parsed.data.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', floorId)

  if (error) {
    return { success: false, error: `Failed to update floor: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'FLOOR_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'floor',
    entityId: floorId,
    oldData: existing,
    newData: parsed.data,
  })

  revalidatePath('/location-management/floors')
  revalidatePath('/administration/floors')
  return { success: true }
}

export async function toggleFloorActiveAction(floorId: string, active: boolean): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.floors.edit')

  const admin = getAdminClient()
  const { error } = await admin
    .from('floors')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', floorId)

  if (error) {
    return { success: false, error: `Failed to update status: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'FLOOR_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'floor',
    entityId: floorId,
    metadata: { active },
  })

  revalidatePath('/location-management/floors')
  revalidatePath('/administration/floors')
  return { success: true }
}
