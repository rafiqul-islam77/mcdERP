'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { FloorLocationSchema } from '@/lib/validation/schemas'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

export async function createFloorLocationAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.floor_locations.create')

  const parsed = FloorLocationSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description'),
    active: formData.get('active') === 'true' || formData.get('active') === 'on',
    sort_order: formData.get('sort_order'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid floor location data.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { code, name, description, active, sort_order } = parsed.data
  const admin = getAdminClient()

  // Verify unique name
  const { data: existing } = await admin
    .from('floor_locations')
    .select('id')
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    return { success: false, error: `Floor location "${name}" already exists.` }
  }

  const { data: newLocation, error } = await admin
    .from('floor_locations')
    .insert({
      code: code || null,
      name,
      description: description || null,
      active,
      sort_order,
    })
    .select('id')
    .single()

  if (error || !newLocation) {
    return { success: false, error: `Failed to create floor location: ${error?.message}` }
  }

  await createAuditLog({
    eventType: 'FLOOR_LOCATION_CREATED',
    actorUserId: actor.profile.id,
    entityType: 'floor_location',
    entityId: newLocation.id,
    newData: { code, name, description, active, sort_order },
  })

  revalidatePath('/location-management/floor-locations')
  revalidatePath('/location-management/floors')
  return { success: true }
}

export async function updateFloorLocationAction(locationId: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.floor_locations.edit')

  const parsed = FloorLocationSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description'),
    active: formData.get('active') === 'true' || formData.get('active') === 'on',
    sort_order: formData.get('sort_order'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid floor location data.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const admin = getAdminClient()
  const { data: existing } = await admin.from('floor_locations').select('*').eq('id', locationId).single()
  if (!existing) {
    return { success: false, error: 'Floor location not found.' }
  }

  const { error } = await admin
    .from('floor_locations')
    .update({
      code: parsed.data.code || null,
      name: parsed.data.name,
      description: parsed.data.description || null,
      active: parsed.data.active,
      sort_order: parsed.data.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', locationId)

  if (error) {
    return { success: false, error: `Failed to update floor location: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'FLOOR_LOCATION_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'floor_location',
    entityId: locationId,
    oldData: existing,
    newData: parsed.data,
  })

  revalidatePath('/location-management/floor-locations')
  revalidatePath('/location-management/floors')
  return { success: true }
}

export async function toggleFloorLocationActiveAction(locationId: string, active: boolean): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  await requirePermission(actor.profile.id, 'admin.floor_locations.edit')

  const admin = getAdminClient()
  const { error } = await admin
    .from('floor_locations')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', locationId)

  if (error) {
    return { success: false, error: `Failed to update status: ${error.message}` }
  }

  await createAuditLog({
    eventType: 'FLOOR_LOCATION_UPDATED',
    actorUserId: actor.profile.id,
    entityType: 'floor_location',
    entityId: locationId,
    metadata: { active },
  })

  revalidatePath('/location-management/floor-locations')
  revalidatePath('/location-management/floors')
  return { success: true }
}
