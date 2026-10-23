'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { NeedleItemSchema } from '@/lib/validation/schemas'
import { revalidatePath } from 'next/cache'
import type { ActionResult, NeedleGroup, NeedleRowItem, Floor } from '@/types'
import { getNeedleCatalog } from '@/lib/needles/catalogs'

// Supabase caps each response. Advance by the number actually returned so a
// lower configured cap cannot skip records or stop us before the final page.
async function fetchAllNeedleRows(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>
): Promise<{ data: any[] | null; error: any }> {
  const rows: any[] = []
  const pageSize = 1000
  while (true) {
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1)
    if (error) return { data: null, error }
    if (!data?.length) return { data: rows, error: null }
    rows.push(...data)
  }
}

/**
 * Fetch all needle items with their multi-floor assignments for the specified needle group.
 * Each page reads its own catalog and assignments; empty tables remain empty.
 */
export async function getNeedleMasterDataAction(params: {
  needleGroup: NeedleGroup
  floorId?: string
  brand?: string
  needleType?: string
  search?: string
}): Promise<
  ActionResult<{
    items: NeedleRowItem[]
    floors: (Floor & { location_name?: string })[]
    distinctBrands: string[]
    distinctNeedleTypes: string[]
    dbReady: boolean
    totalCount: number
  }>
> {
  const actor = await requireActiveAccount()
  const permKey =
    params.needleGroup === 'ideal_needle'
      ? 'needle_management.ideal_needle.view'
      : 'needle_management.needle.view'

  const canView =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.view')) ||
    (await hasPermission(actor.profile.id, 'admin.floors.view'))

  if (!canView) {
    return {
      success: false,
      error: 'You do not have permission to view needle master data.',
    }
  }

  const catalog = getNeedleCatalog(params.needleGroup)
  const admin = getAdminClient()

  // 1. Fetch active floors with locations for checkbox matrix
  let floors: (Floor & { location_name?: string })[] = []
  try {
    const { data: floorData, error: floorError } = await admin
      .from('floors')
      .select('id, code, name, floor_location_id, description, active, sort_order, floor_locations(id, name, code)')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (floorError) throw floorError
    if (floorData) {
      floors = floorData.map((f: any) => ({
        ...f,
        location_name: f.floor_locations?.name || null,
      }))
    }
  } catch (err) {
    console.warn('Error fetching floors:', err)
    return { success: false, error: 'Unable to load floors. Please try again.' }
  }

  // Read only the requested catalog and its own floor assignments.
  let dbReady = true
  let rawItems: any[] = []
  let rawAssignments: any[] = []

  try {
    const { data: itemData, error: itemError } = await fetchAllNeedleRows((from, to) => admin
      .from(catalog.items)
      .select('*')
      .order('item_code', { ascending: true })
      .range(from, to)
    )

    if (itemError) {
      if (['42P01', 'PGRST205'].includes(itemError.code) || itemError.message?.includes('does not exist')) {
        dbReady = false
      } else {
        throw itemError
      }
    } else if (itemData) {
      rawItems = itemData
    }

    if (dbReady) {
      const { data: assignData, error: assignError } = await fetchAllNeedleRows((from, to) => admin
        .from(catalog.assignments)
        .select('needle_item_id, floor_id')
        .order('needle_item_id', { ascending: true })
        .order('floor_id', { ascending: true })
        .range(from, to)
      )

      if (assignError) {
        if (['42P01', 'PGRST205'].includes(assignError.code)) {
          dbReady = false
        } else {
          throw assignError
        }
      } else if (assignData) {
        rawAssignments = assignData
      }
    }
  } catch (err: any) {
    console.warn('Database query failed:', err?.message)
    return { success: false, error: 'Unable to load needle records. Please try again.' }
  }

  if (!dbReady) {
    rawItems = []
    rawAssignments = []
  }

  // Build Assignment lookup: needle_item_id -> floor_id[]
  const assignmentMap = new Map<string, string[]>()
  for (const a of rawAssignments) {
    const list = assignmentMap.get(a.needle_item_id) || []
    list.push(a.floor_id)
    assignmentMap.set(a.needle_item_id, list)
  }

  const allRows: NeedleRowItem[] = []
  for (const item of rawItems) {
    const assignedFloorIds = assignmentMap.get(item.id) || []

    allRows.push({
      id: item.id,
      item_id: item.id,
      description_item: item.description_item,
      item_code: item.item_code,
      tac_inventory_item_code: item.tac_inventory_item_code || null,
      needle_type: item.needle_type,
      size_dia: item.size_dia ?? '',
      brand: item.brand,
      unit_price_bdt: item.unit_price_bdt == null ? null : Number(item.unit_price_bdt),
      unit_price_usd: item.unit_price_usd == null ? null : Number(item.unit_price_usd),
      active: item.active ?? true,
      floor_ids: assignedFloorIds,
      floor_id: assignedFloorIds[0] || null,
      needle_group: params.needleGroup,
    })
  }

  // Distinct brands and needle types for filter dropdowns
  const distinctBrands = Array.from(new Set(rawItems.map((i) => i.brand?.trim()).filter(Boolean))).sort()
  const distinctNeedleTypes = Array.from(new Set(rawItems.map((i) => i.needle_type?.trim()).filter(Boolean))).sort()

  // Apply In-Memory Filters (Search, Floor, Brand, NeedleType)
  let filtered = allRows

  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase()
    filtered = filtered.filter(
      (r) =>
        r.item_code.toLowerCase().includes(q) ||
        (r.tac_inventory_item_code && r.tac_inventory_item_code.toLowerCase().includes(q)) ||
        r.needle_type.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.size_dia.toLowerCase().includes(q) ||
        r.description_item.toLowerCase().includes(q)
    )
  }

  if (params.floorId) {
    if (params.floorId === 'unassigned') {
      filtered = filtered.filter((r) => r.floor_ids.length === 0)
    } else {
      filtered = filtered.filter((r) => r.floor_ids.includes(params.floorId!))
    }
  }

  if (params.brand) {
    filtered = filtered.filter((r) => r.brand.toLowerCase() === params.brand?.toLowerCase())
  }

  if (params.needleType) {
    filtered = filtered.filter((r) => r.needle_type.toLowerCase() === params.needleType?.toLowerCase())
  }

  return {
    success: true,
    data: {
      items: filtered,
      floors,
      distinctBrands,
      distinctNeedleTypes,
      dbReady,
      totalCount: filtered.length,
    },
  }
}

/**
 * Toggle a single floor checkbox for a needle item.
 * Adds or removes the record from this catalog's floor assignments.
 */
export async function toggleNeedleFloorAction(params: {
  item_id: string
  floor_id: string
  checked: boolean
  needle_group: NeedleGroup
}): Promise<ActionResult<{ floor_ids: string[] }>> {
  const actor = await requireActiveAccount()
  const permKey =
    params.needle_group === 'ideal_needle'
      ? 'needle_management.ideal_needle.edit'
      : 'needle_management.needle.edit'

  const canEdit =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.edit'))

  if (!canEdit) {
    return {
      success: false,
      error: 'You do not have permission to modify needle master data.',
    }
  }

  const catalog = getNeedleCatalog(params.needle_group)
  const admin = getAdminClient()
  const { item_id, floor_id, checked, needle_group } = params

  try {
    if (checked) {
      const { error } = await admin.from(catalog.assignments).upsert(
        {
          needle_item_id: item_id,
          floor_id,
        },
        { onConflict: 'needle_item_id,floor_id' }
      )
      if (error) throw error

      await createAuditLog({
        actorUserId: actor.profile.id,
        eventType:
          needle_group === 'ideal_needle'
            ? 'IDEAL_NEEDLE_FLOOR_ASSIGNED'
            : 'NEEDLE_FLOOR_ASSIGNED',
        entityType: catalog.assignments,
        entityId: `${item_id}:${floor_id}`,
        newData: { needle_item_id: item_id, floor_id, needle_group },
      })
    } else {
      const { error } = await admin
        .from(catalog.assignments)
        .delete()
        .eq('needle_item_id', item_id)
        .eq('floor_id', floor_id)
      if (error) throw error

      await createAuditLog({
        actorUserId: actor.profile.id,
        eventType:
          needle_group === 'ideal_needle'
            ? 'IDEAL_NEEDLE_FLOOR_REMOVED'
            : 'NEEDLE_FLOOR_REMOVED',
        entityType: catalog.assignments,
        entityId: `${item_id}:${floor_id}`,
        oldData: { needle_item_id: item_id, floor_id, needle_group },
      })
    }

    const { data: updatedAssignments, error: readError } = await admin
      .from(catalog.assignments)
      .select('floor_id')
      .eq('needle_item_id', item_id)

    if (readError) throw readError
    const floorIds = (updatedAssignments || []).map((a: any) => a.floor_id)

    return {
      success: true,
      data: { floor_ids: floorIds },
    }
  } catch (err: any) {
    console.error('Error toggling needle floor:', err)
    return {
      success: false,
      error: err.message || 'Failed to update floor assignment.',
    }
  }
}

/**
 * Bulk set / check all at once / clear all floors for a needle item.
 */
export async function bulkSetNeedleFloorsAction(params: {
  item_id: string
  floor_ids: string[]
  needle_group: NeedleGroup
}): Promise<ActionResult<{ floor_ids: string[] }>> {
  const actor = await requireActiveAccount()
  const permKey =
    params.needle_group === 'ideal_needle'
      ? 'needle_management.ideal_needle.edit'
      : 'needle_management.needle.edit'

  const canEdit =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.edit'))

  if (!canEdit) {
    return {
      success: false,
      error: 'You do not have permission to modify needle master data.',
    }
  }

  const catalog = getNeedleCatalog(params.needle_group)
  const admin = getAdminClient()
  const { item_id, floor_ids, needle_group } = params

  try {
    const { error } = await admin.rpc(catalog.setFloorsRpc, {
      p_item_id: item_id,
      p_floor_ids: Array.from(new Set(floor_ids)),
    })
    if (error) throw error

    await createAuditLog({
      actorUserId: actor.profile.id,
      eventType:
        needle_group === 'ideal_needle'
          ? 'IDEAL_NEEDLE_FLOOR_ASSIGNED'
          : 'NEEDLE_FLOOR_ASSIGNED',
      entityType: catalog.assignments,
      entityId: item_id,
      newData: { needle_item_id: item_id, floor_ids, needle_group },
    })

    return {
      success: true,
      data: { floor_ids: Array.from(new Set(floor_ids)) },
    }
  } catch (err: any) {
    console.error('Error updating needle floors:', err)
    return {
      success: false,
      error: err.message || 'Failed to update floors.',
    }
  }
}

/**
 * Inline update a specific cell/property of a needle master item.
 */
export async function inlineUpdateNeedleCellAction(params: {
  item_id: string
  field: string
  value: any
  needle_group: NeedleGroup
}): Promise<ActionResult<{ updatedRow?: Partial<NeedleRowItem> }>> {
  const actor = await requireActiveAccount()
  const permKey =
    params.needle_group === 'ideal_needle'
      ? 'needle_management.ideal_needle.edit'
      : 'needle_management.needle.edit'

  const canEdit =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.edit'))

  if (!canEdit) {
    return {
      success: false,
      error: 'You do not have permission to modify needle master data.',
    }
  }

  const catalog = getNeedleCatalog(params.needle_group)
  const admin = getAdminClient()
  const { item_id, field, value, needle_group } = params

  try {
    const allowedFields = [
      'description_item',
      'item_code',
      'tac_inventory_item_code',
      'needle_type',
      'size_dia',
      'brand',
      'unit_price_bdt',
      'unit_price_usd',
      'active',
    ]

    if (!allowedFields.includes(field)) {
      return { success: false, error: `Invalid field "${field}".` }
    }

    let formattedVal: any = value
    if (field === 'unit_price_bdt' || field === 'unit_price_usd') {
      formattedVal = value == null || value === '' ? null : Number(value)
      if (formattedVal !== null && (!Number.isFinite(formattedVal) || formattedVal < 0)) {
        return { success: false, error: 'Price must be a non-negative number.' }
      }
    } else if (field === 'item_code') {
      formattedVal = String(value).trim().toUpperCase()
    } else if (field === 'active') {
      formattedVal = Boolean(value)
    } else if (typeof value === 'string') {
      formattedVal = value.trim()
    }

    if (field === 'item_code' && !formattedVal.startsWith(catalog.prefix)) {
      return { success: false, error: `${catalog.label} item codes must start with ${catalog.prefix}.` }
    }

    if ((field === 'size_dia' || field === 'tac_inventory_item_code') && formattedVal === '') formattedVal = null
    const { data: oldItem, error: oldError } = await admin
      .from(catalog.items)
      .select('*')
      .eq('id', item_id)
      .maybeSingle()

    if (oldError) throw oldError
    if (!oldItem) throw new Error('Needle not found in this catalog.')

    const { error: itemUpdateErr } = await admin
      .from(catalog.items)
      .update({
        [field]: formattedVal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item_id)

    if (itemUpdateErr) throw itemUpdateErr

    await createAuditLog({
      actorUserId: actor.profile.id,
      eventType:
        needle_group === 'ideal_needle' ? 'IDEAL_NEEDLE_UPDATED' : 'NEEDLE_UPDATED',
      entityType: catalog.items,
      entityId: item_id,
      oldData: oldItem ? { [field]: oldItem[field] } : undefined,
      newData: { [field]: formattedVal },
      metadata: { field, value: formattedVal, needle_group },
    })

    return {
      success: true,
      data: { updatedRow: { [field]: field === 'size_dia' ? formattedVal ?? '' : formattedVal } },
    }
  } catch (err: any) {
    console.error('Error updating needle cell:', err)
    return {
      success: false,
      error: err.message || 'Failed to update record.',
    }
  }
}

/**
 * Create a new needle item and immediately connect it with the selected floors for the active group.
 */
export async function createNeedleAction(payload: {
  description_item: string
  item_code: string
  tac_inventory_item_code?: string | null
  needle_type: string
  size_dia: string
  brand: string
  unit_price_bdt: number | null
  unit_price_usd: number | null
  floor_ids?: string[]
  needle_group: NeedleGroup
  active?: boolean
}): Promise<ActionResult<NeedleRowItem>> {
  const actor = await requireActiveAccount()
  const permKey =
    payload.needle_group === 'ideal_needle'
      ? 'needle_management.ideal_needle.create'
      : 'needle_management.needle.create'

  const canCreate =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.create'))

  if (!canCreate) {
    return {
      success: false,
      error: 'You do not have permission to create needle records.',
    }
  }

  const parsed = NeedleItemSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed. Please review inputs.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const {
    description_item,
    item_code,
    tac_inventory_item_code,
    needle_type,
    size_dia,
    brand,
    unit_price_bdt,
    unit_price_usd,
    floor_ids = [],
    needle_group,
    active,
  } = parsed.data

  const catalog = getNeedleCatalog(needle_group)
  if (!item_code.startsWith(catalog.prefix)) {
    const error = `${catalog.label} item codes must start with ${catalog.prefix}.`
    return { success: false, error, fieldErrors: { item_code: [error] } }
  }
  const admin = getAdminClient()

  try {
    const { data: newItem, error: insErr } = await admin
      .from(catalog.items)
      .insert({
        description_item,
        item_code,
        tac_inventory_item_code: tac_inventory_item_code || null,
        needle_type,
        size_dia,
        brand,
        unit_price_bdt,
        unit_price_usd,
        active: active ?? true,
      })
      .select('*')
      .single()

    if (insErr || !newItem) throw insErr || new Error('Failed to create needle master item')
    const itemId = newItem.id

    if (floor_ids.length > 0) {
      const { error } = await admin.rpc(catalog.setFloorsRpc, { p_item_id: itemId, p_floor_ids: floor_ids })
      if (error) {
        const { error: cleanupError } = await admin.from(catalog.items).delete().eq('id', itemId)
        if (cleanupError) throw new Error('Needle created, but floor assignment failed. Reload and assign its floors.')
        throw error
      }
    }

    await createAuditLog({
      actorUserId: actor.profile.id,
      eventType:
        needle_group === 'ideal_needle' ? 'IDEAL_NEEDLE_CREATED' : 'NEEDLE_CREATED',
      entityType: catalog.items,
      entityId: itemId,
      newData: {
        item_code,
        needle_type,
        size_dia,
        brand,
        floor_ids,
        needle_group,
      },
    })

    const newRow: NeedleRowItem = {
      id: itemId,
      item_id: itemId,
      description_item,
      item_code,
      tac_inventory_item_code: tac_inventory_item_code || null,
      needle_type,
      size_dia,
      brand,
      unit_price_bdt,
      unit_price_usd,
      active: active ?? true,
      floor_ids,
      needle_group,
    }

    revalidatePath(
      needle_group === 'ideal_needle'
        ? '/needle-management/ideal-needle'
        : '/needle-management/needle'
    )

    return {
      success: true,
      data: newRow,
      message: 'Needle created successfully.',
    }
  } catch (err: any) {
    console.error('Error creating needle:', err)
    return {
      success: false,
      error: err.message || 'Failed to create needle.',
    }
  }
}

/**
 * Delete a needle item master record.
 */
export async function deleteNeedleAction(params: {
  item_id: string
  needle_group: NeedleGroup
}): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  const permKey =
    params.needle_group === 'ideal_needle'
      ? 'needle_management.ideal_needle.delete'
      : 'needle_management.needle.delete'

  const canDelete =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.delete'))

  if (!canDelete) {
    return {
      success: false,
      error: 'You do not have permission to delete needle records.',
    }
  }

  const catalog = getNeedleCatalog(params.needle_group)
  const admin = getAdminClient()
  const { item_id, needle_group } = params

  try {
    const { data: deleted, error } = await admin.from(catalog.items).delete().eq('id', item_id).select('id').maybeSingle()
    if (error) throw error
    if (!deleted) throw new Error('Needle not found in this catalog.')
    await createAuditLog({
      actorUserId: actor.profile.id,
      eventType:
        needle_group === 'ideal_needle' ? 'IDEAL_NEEDLE_DELETED' : 'NEEDLE_DELETED',
      entityType: catalog.items,
      entityId: item_id,
      oldData: { item_id, needle_group },
    })

    revalidatePath(
      needle_group === 'ideal_needle'
        ? '/needle-management/ideal-needle'
        : '/needle-management/needle'
    )

    return {
      success: true,
      message: 'Needle record deleted successfully.',
    }
  } catch (err: any) {
    console.error('Error deleting needle:', err)
    return {
      success: false,
      error: err.message || 'Failed to remove needle record.',
    }
  }
}
