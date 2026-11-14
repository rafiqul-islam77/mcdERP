'use server'

import { revalidatePath } from 'next/cache'
import { createAuditLog } from '@/lib/audit'
import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { PERMISSIONS } from '@/lib/permissions/keys'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  buildTransferNotes,
  parseTransferNotes,
  resolveTransferPairFromRows,
  resolveTransfersForDailyEntryCell,
  validateChronologicalStockAfterDelta,
  type FloorSummary,
  type TransferTxRow,
} from '@/lib/transfers/transfer-helpers'
import type {
  ActionResult,
  CurrentUser,
  DailyEntryCategory,
  FloorTransferDetail,
} from '@/types'

type AdminClient = ReturnType<typeof getAdminClient>

function getCategoryTables(category: DailyEntryCategory): {
  masterItems: string
  transactions: string
} {
  switch (category) {
    case 'NEW':
      return {
        masterItems: 'normal_needle_items',
        transactions: 'needle_new_transactions',
      }
    case 'RUNNING':
      return {
        masterItems: 'normal_needle_items',
        transactions: 'needle_running_transactions',
      }
    case 'IDLE':
      return {
        masterItems: 'idle_needle_items',
        transactions: 'needle_idle_transactions',
      }
  }
}

function isUserAuthorizedForFloor(actor: CurrentUser, floorId: string): boolean {
  if (actor.isSiteAdmin) return true
  const profile = actor.profile
  const assignedIds: string[] = Array.isArray(profile.floor_ids) ? [...profile.floor_ids] : []
  if (profile.floor_id && !assignedIds.includes(profile.floor_id)) {
    assignedIds.push(profile.floor_id)
  }
  return assignedIds.includes(floorId)
}

async function canAccessCategory(
  actorId: string,
  isSiteAdmin: boolean,
  category: DailyEntryCategory
): Promise<boolean> {
  if (isSiteAdmin) return true
  switch (category) {
    case 'RUNNING':
      return await hasPermission(actorId, PERMISSIONS.NEEDLE.DAILY_ENTRY.VIEW)
    case 'NEW':
      return await hasPermission(actorId, PERMISSIONS.BROKEN.DAILY_ENTRY.VIEW)
    case 'IDLE':
      return await hasPermission(actorId, PERMISSIONS.IDLE.DAILY_ENTRY.VIEW)
  }
}

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42703' || Boolean(err.message?.includes('transfer_group_id'))
}

function isMissingTableOrRpcError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return ['42883', 'PGRST202', '42P01', 'PGRST205'].includes(err.code || '')
}

function revalidateDailyEntryRoutes() {
  revalidatePath('/running-needle/daily-entry')
  revalidatePath('/new-needle/daily-entry')
  revalidatePath('/broken-needle/daily-entry')
  revalidatePath('/idle-needle/daily-entry')
  revalidatePath('/needle/daily-entry')
}

async function findTransferHistoryByOperationId(admin: AdminClient, operationId: string | undefined) {
  if (!operationId) return null
  const { data, error } = await admin
    .from('needle_floor_transfer_history')
    .select(
      'id, transfer_group_id, transfer_out_id, transfer_in_id, category, status, needle_item_id, transfer_date, from_floor_id, to_floor_id, previous_data, new_data'
    )
    .eq('operation_id', operationId)
    .limit(1)

  if (error) {
    if (isMissingTableOrRpcError(error)) return null
    throw error
  }
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

async function fetchFloorsSummary(admin: AdminClient): Promise<FloorSummary[]> {
  const { data, error } = await admin.from('floors').select('id, name')
  if (error) throw error
  return (data || []) as FloorSummary[]
}

async function fetchTransferRowsByDateNeedle(
  admin: AdminClient,
  tableName: string,
  date: string,
  needleItemId: string
): Promise<TransferTxRow[]> {
  const fullSelect =
    'id, transaction_date, floor_id, needle_item_id, transaction_type, quantity, req_no, notes, created_at, transfer_group_id'
  const baseSelect =
    'id, transaction_date, floor_id, needle_item_id, transaction_type, quantity, req_no, notes, created_at'

  const res = await admin
    .from(tableName)
    .select(fullSelect)
    .eq('transaction_date', date)
    .eq('needle_item_id', needleItemId)
    .in('transaction_type', ['TRANSFER_OUT', 'TRANSFER_IN'])

  if (!res.error) return (res.data || []) as TransferTxRow[]
  if (!isMissingColumnError(res.error)) throw res.error

  const fb = await admin
    .from(tableName)
    .select(baseSelect)
    .eq('transaction_date', date)
    .eq('needle_item_id', needleItemId)
    .in('transaction_type', ['TRANSFER_OUT', 'TRANSFER_IN'])

  if (fb.error) throw fb.error
  return (fb.data || []) as TransferTxRow[]
}

async function fetchSingleTransferOutRow(
  admin: AdminClient,
  tableName: string,
  transferOutId: string
): Promise<TransferTxRow | null> {
  const fullSelect =
    'id, transaction_date, floor_id, needle_item_id, transaction_type, quantity, req_no, notes, created_at, transfer_group_id'
  const baseSelect =
    'id, transaction_date, floor_id, needle_item_id, transaction_type, quantity, req_no, notes, created_at'

  const res = await admin
    .from(tableName)
    .select(fullSelect)
    .eq('id', transferOutId)
    .eq('transaction_type', 'TRANSFER_OUT')
    .limit(1)

  if (!res.error) {
    const rows = (res.data || []) as TransferTxRow[]
    return rows[0] || null
  }
  if (!isMissingColumnError(res.error)) throw res.error

  const fb = await admin
    .from(tableName)
    .select(baseSelect)
    .eq('id', transferOutId)
    .eq('transaction_type', 'TRANSFER_OUT')
    .limit(1)

  if (fb.error) throw fb.error
  const rows = (fb.data || []) as TransferTxRow[]
  return rows[0] || null
}

async function fetchFloorNeedleTransactions(
  admin: AdminClient,
  tableName: string,
  floorId: string,
  needleItemId: string
): Promise<Array<{ transaction_date: string; transaction_type: string; quantity: number }>> {
  const { data, error } = await admin
    .from(tableName)
    .select('transaction_date, transaction_type, quantity')
    .eq('floor_id', floorId)
    .eq('needle_item_id', needleItemId)
    .order('transaction_date', { ascending: true })

  if (error) throw error
  return (data || []) as Array<{ transaction_date: string; transaction_type: string; quantity: number }>
}

/**
 * Fetch detailed transfer records (incoming + outgoing) for a specific Daily Entry row.
 */
export async function getFloorTransfersForRowAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
  needleItemId: string
  needleName?: string
}): Promise<ActionResult<{ transfers: FloorTransferDetail[] }>> {
  const actor = await requireActiveAccount()

  if (!isUserAuthorizedForFloor(actor, params.floorId)) {
    return { success: false, error: 'Unauthorized: You do not have access to this floor.' }
  }
  const hasCat = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, params.category)
  if (!hasCat) {
    return { success: false, error: `Unauthorized: You do not have permission for ${params.category} category.` }
  }

  const admin = getAdminClient()
  const tables = getCategoryTables(params.category)

  try {
    const [txRows, floors] = await Promise.all([
      fetchTransferRowsByDateNeedle(admin, tables.transactions, params.date, params.needleItemId),
      fetchFloorsSummary(admin),
    ])

    let needleName = params.needleName?.trim() || ''
    if (!needleName) {
      const { data: item } = await admin
        .from(tables.masterItems)
        .select('item_code, needle_type, size_dia')
        .eq('id', params.needleItemId)
        .single()
      if (item) {
        needleName = `${item.item_code} — ${item.needle_type} (${item.size_dia})`
      } else {
        needleName = 'Needle Item'
      }
    }

    const transfers = resolveTransfersForDailyEntryCell({
      inspectedFloorId: params.floorId,
      category: params.category,
      needleName,
      allDateNeedleTxs: txRows,
      floors,
    })

    return { success: true, data: { transfers } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load floor transfer details.'
    console.error('[getFloorTransfersForRowAction] error:', err)
    return { success: false, error: message }
  }
}

/**
 * Edit an existing Floor Transfer atomically across source and destination floors.
 * Source Floor, Needle Item, and Date remain immutable; edits affect Destination Floor,
 * Transfer Quantity, Receiver Name, and Requisition No.
 */
export async function editFloorTransferAction(params: {
  category: DailyEntryCategory
  transferId: string
  newToFloorId: string
  newQuantity: number
  newReceiverName: string
  newReqNo?: string | null
  operationId?: string
}): Promise<
  ActionResult<{
    transferOutId: string
    transferInId: string | null
    transferDate: string
    fromFloorId: string
    oldToFloorId: string
    newToFloorId: string
    needleItemId: string
    idempotent?: boolean
  }>
> {
  const actor = await requireActiveAccount()

  const hasEditPerm = actor.isSiteAdmin || (await hasPermission(actor.profile.id, PERMISSIONS.FLOOR_TRANSFER.EDIT))
  if (!hasEditPerm) {
    return { success: false, error: 'Unauthorized: You do not have permission to edit floor transfers.' }
  }
  const hasCat = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, params.category)
  if (!hasCat) {
    return { success: false, error: `Unauthorized: You do not have permission for ${params.category} category.` }
  }
  if (!Number.isFinite(params.newQuantity) || params.newQuantity <= 0) {
    return { success: false, error: 'Transfer quantity must be greater than zero.' }
  }
  if (!params.newToFloorId) {
    return { success: false, error: 'Destination floor is required.' }
  }
  if (!params.newReceiverName?.trim()) {
    return { success: false, error: 'Receiver name is required.' }
  }

  const admin = getAdminClient()
  const tables = getCategoryTables(params.category)

  try {
    // 1. Idempotency check prior to mutation
    const existingOp = await findTransferHistoryByOperationId(admin, params.operationId)
    if (existingOp) {
      const prevFloorId = existingOp.from_floor_id as string
      const prevDestId =
        ((existingOp.previous_data as Record<string, unknown> | null)?.to_floor_id as string) ||
        (existingOp.to_floor_id as string)
      if (!isUserAuthorizedForFloor(actor, prevFloorId) && !isUserAuthorizedForFloor(actor, prevDestId)) {
        return { success: false, error: 'Unauthorized: You do not have access to this transfer floor.' }
      }
      return {
        success: true,
        data: {
          transferOutId: existingOp.transfer_out_id as string,
          transferInId: (existingOp.transfer_in_id as string | null) ?? null,
          transferDate: existingOp.transfer_date as string,
          fromFloorId: prevFloorId,
          oldToFloorId: prevDestId,
          newToFloorId: existingOp.to_floor_id as string,
          needleItemId: existingOp.needle_item_id as string,
          idempotent: true,
        },
      }
    }

    // 2. Resolve existing transfer pair for authorization and metadata
    const outRow = await fetchSingleTransferOutRow(admin, tables.transactions, params.transferId)
    if (!outRow) {
      return { success: false, error: 'Transfer record not found or already deleted.' }
    }

    const [dateRows, floors] = await Promise.all([
      fetchTransferRowsByDateNeedle(admin, tables.transactions, outRow.transaction_date, outRow.needle_item_id),
      fetchFloorsSummary(admin),
    ])
    const resolved = resolveTransferPairFromRows({
      outRow,
      candidateInRows: dateRows.filter((r) => r.transaction_type === 'TRANSFER_IN'),
      floors,
    })

    if (!resolved.inRow) {
      return {
        success: false,
        error: 'Matching destination TRANSFER_IN record could not be resolved for this transfer.',
      }
    }

    const oldToFloorId = resolved.inRow.floor_id
    if (
      !isUserAuthorizedForFloor(actor, outRow.floor_id) &&
      !isUserAuthorizedForFloor(actor, oldToFloorId)
    ) {
      return { success: false, error: 'Unauthorized: You do not have access to the floors in this transfer.' }
    }
    if (params.newToFloorId === outRow.floor_id) {
      return { success: false, error: 'Destination Floor cannot be the same as Source Floor.' }
    }

    const newToFloor = floors.find((f) => f.id === params.newToFloorId)
    if (!newToFloor) {
      return { success: false, error: 'Selected destination Floor not found.' }
    }

    const cleanReceiver = params.newReceiverName.trim()
    const cleanReqNo = params.newReqNo?.trim() ? params.newReqNo.trim() : null

    // 3. Execute Atomic RPC first
    const { data: rpcResult, error: rpcErr } = await admin.rpc('edit_needle_floor_transfer_atomic', {
      p_category: params.category,
      p_transfer_out_id: params.transferId,
      p_new_to_floor_id: params.newToFloorId,
      p_new_quantity: params.newQuantity,
      p_new_receiver_name: cleanReceiver,
      p_new_req_no: cleanReqNo,
      p_actor_id: actor.profile.id,
      p_operation_id: params.operationId || null,
    })

    let oldAuditData: Record<string, unknown> = {
      transfer_out_id: outRow.id,
      transfer_in_id: resolved.inRow.id,
      from_floor_id: outRow.floor_id,
      from_floor_name: resolved.fromFloorName,
      to_floor_id: oldToFloorId,
      to_floor_name: resolved.toFloorName,
      quantity: Number(outRow.quantity) || 0,
      receiver_name: resolved.receiverName,
      req_no: outRow.req_no,
      transfer_date: outRow.transaction_date,
      needle_item_id: outRow.needle_item_id,
    }
    let newAuditData: Record<string, unknown> = {
      transfer_out_id: outRow.id,
      transfer_in_id: resolved.inRow.id,
      from_floor_id: outRow.floor_id,
      from_floor_name: resolved.fromFloorName,
      to_floor_id: params.newToFloorId,
      to_floor_name: newToFloor.name,
      quantity: params.newQuantity,
      receiver_name: cleanReceiver,
      req_no: cleanReqNo,
      transfer_date: outRow.transaction_date,
      needle_item_id: outRow.needle_item_id,
    }
    let updatedInId: string = resolved.inRow.id
    let isIdempotentReplay = false

    if (rpcErr) {
      if (!['42883', 'PGRST202'].includes(rpcErr.code || '')) {
        return { success: false, error: rpcErr.message || 'Failed to update floor transfer.' }
      }

      // 4. Fallback chronological validation + paired update when RPC is absent
      const oldQty = Number(outRow.quantity) || 0
      const fromDelta = oldQty - params.newQuantity
      if (fromDelta < 0) {
        const fromTxs = await fetchFloorNeedleTransactions(
          admin,
          tables.transactions,
          outRow.floor_id,
          outRow.needle_item_id
        )
        const fromCheck = validateChronologicalStockAfterDelta(fromTxs, outRow.transaction_date, fromDelta)
        if (!fromCheck.valid) {
          return {
            success: false,
            error: `Cannot update transfer: insufficient available stock on source Floor (${resolved.fromFloorName}) on ${fromCheck.failingDate}.`,
          }
        }
      }

      const oldToDelta = params.newToFloorId === oldToFloorId ? params.newQuantity - oldQty : -oldQty
      if (oldToDelta < 0) {
        const toTxs = await fetchFloorNeedleTransactions(
          admin,
          tables.transactions,
          oldToFloorId,
          outRow.needle_item_id
        )
        const toCheck = validateChronologicalStockAfterDelta(toTxs, outRow.transaction_date, oldToDelta)
        if (!toCheck.valid) {
          return {
            success: false,
            error: `Cannot update transfer: the destination Floor (${resolved.toFloorName}) has insufficient available stock on ${toCheck.failingDate}.`,
          }
        }
      }

      const { outNotes, inNotes } = buildTransferNotes({
        fromFloorName: resolved.fromFloorName,
        toFloorName: newToFloor.name,
        receiverName: cleanReceiver,
      })

      const { error: outUpdErr } = await admin
        .from(tables.transactions)
        .update({
          quantity: params.newQuantity,
          req_no: cleanReqNo,
          notes: outNotes,
          updated_by: actor.profile.id,
        })
        .eq('id', outRow.id)
      if (outUpdErr) throw outUpdErr

      if (params.newToFloorId === oldToFloorId) {
        const { error: inUpdErr } = await admin
          .from(tables.transactions)
          .update({
            quantity: params.newQuantity,
            req_no: cleanReqNo,
            notes: inNotes,
            updated_by: actor.profile.id,
          })
          .eq('id', resolved.inRow.id)

        if (inUpdErr) {
          await admin
            .from(tables.transactions)
            .update({
              quantity: outRow.quantity,
              req_no: outRow.req_no,
              notes: outRow.notes,
              updated_by: actor.profile.id,
            })
            .eq('id', outRow.id)
          throw inUpdErr
        }
      } else {
        const { error: delOldInErr } = await admin
          .from(tables.transactions)
          .delete()
          .eq('id', resolved.inRow.id)
        if (delOldInErr) {
          await admin
            .from(tables.transactions)
            .update({
              quantity: outRow.quantity,
              req_no: outRow.req_no,
              notes: outRow.notes,
              updated_by: actor.profile.id,
            })
            .eq('id', outRow.id)
          throw delOldInErr
        }

        const insertPayload: Record<string, unknown> = {
          transaction_date: outRow.transaction_date,
          floor_id: params.newToFloorId,
          needle_item_id: outRow.needle_item_id,
          transaction_type: 'TRANSFER_IN',
          quantity: params.newQuantity,
          req_no: cleanReqNo,
          notes: inNotes,
          created_by: actor.profile.id,
          updated_by: actor.profile.id,
        }
        if (outRow.transfer_group_id) {
          insertPayload.transfer_group_id = outRow.transfer_group_id
        }

        const { data: insertedIn, error: insNewInErr } = await admin
          .from(tables.transactions)
          .insert(insertPayload)
          .select('id')
          .single()

        if (insNewInErr) {
          await admin.from(tables.transactions).insert({
            id: resolved.inRow.id,
            transaction_date: resolved.inRow.transaction_date,
            floor_id: resolved.inRow.floor_id,
            needle_item_id: resolved.inRow.needle_item_id,
            transaction_type: 'TRANSFER_IN',
            quantity: resolved.inRow.quantity,
            req_no: resolved.inRow.req_no,
            notes: resolved.inRow.notes,
            created_by: actor.profile.id,
            updated_by: actor.profile.id,
          })
          await admin
            .from(tables.transactions)
            .update({
              quantity: outRow.quantity,
              req_no: outRow.req_no,
              notes: outRow.notes,
              updated_by: actor.profile.id,
            })
            .eq('id', outRow.id)
          throw insNewInErr
        }

        if (insertedIn?.id) {
          updatedInId = insertedIn.id as string
          newAuditData = { ...newAuditData, transfer_in_id: updatedInId }
        }
      }

      const { error: histErr } = await admin.from('needle_floor_transfer_history').insert({
        transfer_group_id: outRow.transfer_group_id || null,
        transfer_out_id: outRow.id,
        transfer_in_id: updatedInId,
        category: params.category,
        status: 'edited',
        needle_item_id: outRow.needle_item_id,
        transfer_date: outRow.transaction_date,
        from_floor_id: outRow.floor_id,
        to_floor_id: params.newToFloorId,
        quantity: params.newQuantity,
        receiver_name: cleanReceiver,
        req_no: cleanReqNo,
        previous_data: oldAuditData,
        new_data: newAuditData,
        actor_user_id: actor.profile.id,
        operation_id: params.operationId || null,
      })
      if (histErr && !isMissingTableOrRpcError(histErr)) {
        console.warn('[editFloorTransferAction] history insert skipped:', histErr.message)
      }
    } else if (rpcResult && typeof rpcResult === 'object') {
      const resObj = rpcResult as Record<string, unknown>
      isIdempotentReplay = Boolean(resObj.idempotent)
      if (typeof resObj.transfer_in_id === 'string') {
        updatedInId = resObj.transfer_in_id
      }
      if (resObj.old_data && typeof resObj.old_data === 'object') {
        oldAuditData = resObj.old_data as Record<string, unknown>
      }
      if (resObj.new_data && typeof resObj.new_data === 'object') {
        newAuditData = resObj.new_data as Record<string, unknown>
      }
    }

    if (!isIdempotentReplay) {
      await createAuditLog({
        actorUserId: actor.profile.id,
        eventType: 'TRANSFER_EDIT',
        entityType: tables.transactions,
        entityId: outRow.id,
        oldData: oldAuditData,
        newData: newAuditData,
        metadata: {
          category: params.category,
          transfer_out_id: outRow.id,
          transfer_in_id: updatedInId,
          operation_id: params.operationId || null,
        },
      })
    }

    revalidateDailyEntryRoutes()

    return {
      success: true,
      data: {
        transferOutId: outRow.id,
        transferInId: updatedInId,
        transferDate: outRow.transaction_date,
        fromFloorId: outRow.floor_id,
        oldToFloorId,
        newToFloorId: params.newToFloorId,
        needleItemId: outRow.needle_item_id,
        idempotent: isIdempotentReplay,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update floor transfer.'
    console.error('[editFloorTransferAction] error:', err)
    return { success: false, error: message }
  }
}

/**
 * Delete / cancel an existing Floor Transfer atomically, reversing its stock impact
 * on both Source and Destination floors while preserving audit and transfer history evidence.
 */
export async function deleteFloorTransferAction(params: {
  category: DailyEntryCategory
  transferId: string
  operationId?: string
}): Promise<
  ActionResult<{
    transferOutId: string
    transferInId: string | null
    transferDate: string
    fromFloorId: string
    toFloorId: string
    needleItemId: string
    idempotent?: boolean
  }>
> {
  const actor = await requireActiveAccount()

  const hasDeletePerm = actor.isSiteAdmin || (await hasPermission(actor.profile.id, PERMISSIONS.FLOOR_TRANSFER.DELETE))
  if (!hasDeletePerm) {
    return { success: false, error: 'Unauthorized: You do not have permission to delete floor transfers.' }
  }
  const hasCat = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, params.category)
  if (!hasCat) {
    return { success: false, error: `Unauthorized: You do not have permission for ${params.category} category.` }
  }

  const admin = getAdminClient()
  const tables = getCategoryTables(params.category)

  try {
    // 1. Idempotency check BEFORE querying active rows
    const existingOp = await findTransferHistoryByOperationId(admin, params.operationId)
    if (existingOp) {
      const fromFloorId = existingOp.from_floor_id as string
      const toFloorId = existingOp.to_floor_id as string
      if (!isUserAuthorizedForFloor(actor, fromFloorId) && !isUserAuthorizedForFloor(actor, toFloorId)) {
        return { success: false, error: 'Unauthorized: You do not have access to this transfer floor.' }
      }
      return {
        success: true,
        data: {
          transferOutId: existingOp.transfer_out_id as string,
          transferInId: (existingOp.transfer_in_id as string | null) ?? null,
          transferDate: existingOp.transfer_date as string,
          fromFloorId,
          toFloorId,
          needleItemId: existingOp.needle_item_id as string,
          idempotent: true,
        },
      }
    }

    // 2. Resolve existing pair
    const outRow = await fetchSingleTransferOutRow(admin, tables.transactions, params.transferId)
    if (!outRow) {
      return { success: false, error: 'Transfer record not found or already deleted.' }
    }

    const [dateRows, floors] = await Promise.all([
      fetchTransferRowsByDateNeedle(admin, tables.transactions, outRow.transaction_date, outRow.needle_item_id),
      fetchFloorsSummary(admin),
    ])
    const resolved = resolveTransferPairFromRows({
      outRow,
      candidateInRows: dateRows.filter((r) => r.transaction_type === 'TRANSFER_IN'),
      floors,
    })

    if (!resolved.inRow) {
      return {
        success: false,
        error: 'Matching destination TRANSFER_IN record could not be resolved for this transfer.',
      }
    }

    const toFloorId = resolved.inRow.floor_id
    if (
      !isUserAuthorizedForFloor(actor, outRow.floor_id) &&
      !isUserAuthorizedForFloor(actor, toFloorId)
    ) {
      return { success: false, error: 'Unauthorized: You do not have access to the floors in this transfer.' }
    }

    // 3. Execute Atomic RPC first
    const { data: rpcResult, error: rpcErr } = await admin.rpc('delete_needle_floor_transfer_atomic', {
      p_category: params.category,
      p_transfer_out_id: params.transferId,
      p_actor_id: actor.profile.id,
      p_operation_id: params.operationId || null,
    })

    let oldAuditData: Record<string, unknown> = {
      transfer_out_id: outRow.id,
      transfer_in_id: resolved.inRow.id,
      from_floor_id: outRow.floor_id,
      from_floor_name: resolved.fromFloorName,
      to_floor_id: toFloorId,
      to_floor_name: resolved.toFloorName,
      quantity: Number(outRow.quantity) || 0,
      receiver_name: resolved.receiverName,
      req_no: outRow.req_no,
      transfer_date: outRow.transaction_date,
      needle_item_id: outRow.needle_item_id,
    }
    let isIdempotentReplay = false

    if (rpcErr) {
      if (!['42883', 'PGRST202'].includes(rpcErr.code || '')) {
        return { success: false, error: rpcErr.message || 'Failed to delete floor transfer.' }
      }

      // 4. Fallback chronological validation + atomic pair deletion
      const transferQty = Number(outRow.quantity) || 0
      const toTxs = await fetchFloorNeedleTransactions(
        admin,
        tables.transactions,
        toFloorId,
        outRow.needle_item_id
      )
      const check = validateChronologicalStockAfterDelta(toTxs, outRow.transaction_date, -transferQty)
      if (!check.valid) {
        return {
          success: false,
          error: `Cannot delete this transfer. The destination Floor (${resolved.toFloorName}) has insufficient available stock on ${check.failingDate} to reverse the transfer.`,
        }
      }

      const { error: histErr } = await admin.from('needle_floor_transfer_history').insert({
        transfer_group_id: outRow.transfer_group_id || null,
        transfer_out_id: outRow.id,
        transfer_in_id: resolved.inRow.id,
        category: params.category,
        status: 'cancelled',
        needle_item_id: outRow.needle_item_id,
        transfer_date: outRow.transaction_date,
        from_floor_id: outRow.floor_id,
        to_floor_id: toFloorId,
        quantity: transferQty,
        receiver_name: parseTransferNotes(outRow.notes).receiverName,
        req_no: outRow.req_no,
        previous_data: oldAuditData,
        new_data: null,
        actor_user_id: actor.profile.id,
        operation_id: params.operationId || null,
      })
      if (histErr && !isMissingTableOrRpcError(histErr)) {
        console.warn('[deleteFloorTransferAction] history insert skipped:', histErr.message)
      }

      const { error: delOutErr } = await admin.from(tables.transactions).delete().eq('id', outRow.id)
      if (delOutErr) throw delOutErr

      const { error: delInErr } = await admin
        .from(tables.transactions)
        .delete()
        .eq('id', resolved.inRow.id)
      if (delInErr) {
        await admin.from(tables.transactions).insert({
          id: outRow.id,
          transaction_date: outRow.transaction_date,
          floor_id: outRow.floor_id,
          needle_item_id: outRow.needle_item_id,
          transaction_type: outRow.transaction_type,
          quantity: outRow.quantity,
          req_no: outRow.req_no,
          notes: outRow.notes,
          created_by: actor.profile.id,
          updated_by: actor.profile.id,
        })
        throw delInErr
      }
    } else if (rpcResult && typeof rpcResult === 'object') {
      const resObj = rpcResult as Record<string, unknown>
      isIdempotentReplay = Boolean(resObj.idempotent)
      if (resObj.old_data && typeof resObj.old_data === 'object') {
        oldAuditData = resObj.old_data as Record<string, unknown>
      }
    }

    if (!isIdempotentReplay) {
      await createAuditLog({
        actorUserId: actor.profile.id,
        eventType: 'TRANSFER_DELETE',
        entityType: tables.transactions,
        entityId: outRow.id,
        oldData: oldAuditData,
        newData: null,
        metadata: {
          category: params.category,
          transfer_out_id: outRow.id,
          transfer_in_id: resolved.inRow.id,
          operation_id: params.operationId || null,
        },
      })
    }

    revalidateDailyEntryRoutes()

    return {
      success: true,
      data: {
        transferOutId: outRow.id,
        transferInId: resolved.inRow.id,
        transferDate: outRow.transaction_date,
        fromFloorId: outRow.floor_id,
        toFloorId,
        needleItemId: outRow.needle_item_id,
        idempotent: isIdempotentReplay,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete floor transfer.'
    console.error('[deleteFloorTransferAction] error:', err)
    return { success: false, error: message }
  }
}
