'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import type {
  ActionResult,
  AuthorizedMasterCatalogData,
  OfflineStockHistorySyncData,
  DailyStockSnapshotRecord,
  StockBaselineRecord,
  StockMovementRecord,
  CachedSheetHeader,
  DailyEntryCategory,
  DailyEntryRowItem,
  Floor,
  DailyTransactionType,
} from '@/types'

// Map category to master tables
function getCategoryTableNames(category: DailyEntryCategory) {
  switch (category) {
    case 'NEW':
      return {
        masterItems: 'normal_needle_items',
        floorAssignments: 'normal_needle_floor_assignments',
        transactions: 'needle_new_transactions',
      }
    case 'RUNNING':
      return {
        masterItems: 'normal_needle_items',
        floorAssignments: 'normal_needle_floor_assignments',
        transactions: 'needle_running_transactions',
      }
    case 'IDLE':
      return {
        masterItems: 'idle_needle_items',
        floorAssignments: 'idle_needle_floor_assignments',
        transactions: 'needle_idle_transactions',
      }
  }
}

// Generate unique, stable requisition number
export async function generateReqNo(dateStr: string, _itemCode?: string): Promise<string> {
  const cleanDate = dateStr.replace(/[^0-9]/g, '') || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const randomSuffix = Math.floor(10000 + Math.random() * 90000)
  return `REQ-${cleanDate}-${randomSuffix}`
}

/**
 * Check if the user is authorized to access a given floor.
 * Site Admin can access all floors. Other users are constrained to profiles.floor_ids / profile.floor_id.
 */
function isUserAuthorizedForFloor(actor: any, floorId: string): boolean {
  if (actor.isSiteAdmin) return true
  const profile = actor.profile
  const assignedIds: string[] = []
  if (Array.isArray(profile.floor_ids)) {
    assignedIds.push(...profile.floor_ids)
  }
  if (profile.floor_id && !assignedIds.includes(profile.floor_id)) {
    assignedIds.push(profile.floor_id)
  }
  return assignedIds.includes(floorId)
}

/**
 * Check if the user has permission to access a specific Daily Entry category.
 */
async function canAccessCategory(actorId: string, isSiteAdmin: boolean, category: DailyEntryCategory): Promise<boolean> {
  if (isSiteAdmin) return true
  switch (category) {
    case 'RUNNING':
      return (
        (await hasPermission(actorId, 'needle.daily_entry.running')) ||
        (await hasPermission(actorId, 'needle.daily_entry.view'))
      )
    case 'NEW':
      return (
        (await hasPermission(actorId, 'needle.daily_entry.new')) ||
        (await hasPermission(actorId, 'broken.daily_entry.view'))
      )
    case 'IDLE':
      return (
        (await hasPermission(actorId, 'needle.daily_entry.idle')) ||
        (await hasPermission(actorId, 'idle.daily_entry.view'))
      )
  }
}

/**
 * Get authorized floors and categories for the current logged-in user.
 */
export async function getAuthorizedContextAction(): Promise<
  ActionResult<{
    floors: Floor[]
    allowedCategories: DailyEntryCategory[]
    allActiveFloors: Floor[] // For transfer destination
  }>
> {
  const actor = await requireActiveAccount()
  const admin = getAdminClient()

  const { data: allFloors, error: floorError } = await admin
    .from('floors')
    .select('id, code, name, description, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (floorError || !allFloors) {
    return { success: false, error: 'Failed to load floors' }
  }

  // Filter authorized floors for current user
  const authorizedFloors = actor.isSiteAdmin
    ? allFloors
    : allFloors.filter((f: Floor) => isUserAuthorizedForFloor(actor, f.id))

  // Determine allowed categories
  const allowedCategories: DailyEntryCategory[] = []
  if (await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'RUNNING')) {
    allowedCategories.push('RUNNING')
  }
  if (await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'NEW')) {
    allowedCategories.push('NEW')
  }
  if (await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'IDLE')) {
    allowedCategories.push('IDLE')
  }

  return {
    success: true,
    data: {
      floors: authorizedFloors,
      allowedCategories,
      allActiveFloors: allFloors,
    },
  }
}

/**
 * Load Daily Entry sheet rows and calculated stock balances.
 */
/**
 * Load the complete authorized needle master items and floor assignments
 * for caching in IndexedDB so all authorized combinations are available offline.
 */
export async function getAuthorizedNeedleMasterCacheAction(): Promise<
  ActionResult<AuthorizedMasterCatalogData>
> {
  const actor = await requireActiveAccount()
  const admin = getAdminClient()

  // 1. Fetch all active floors
  const { data: allFloors, error: floorError } = await admin
    .from('floors')
    .select('id, code, name, description, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (floorError || !allFloors) {
    return { success: false, error: 'Failed to load floors' }
  }

  // 2. Determine authorized floors for current user
  const authorizedFloors = actor.isSiteAdmin
    ? allFloors
    : allFloors.filter((f: Floor) => isUserAuthorizedForFloor(actor, f.id))

  const authorizedFloorIds = authorizedFloors.map((f: Floor) => f.id)

  // 3. Determine allowed categories
  const allowedCategories: DailyEntryCategory[] = []
  const hasRunning = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'RUNNING')
  if (hasRunning) allowedCategories.push('RUNNING')
  const hasNew = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'NEW')
  if (hasNew) allowedCategories.push('NEW')
  const hasIdle = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'IDLE')
  if (hasIdle) allowedCategories.push('IDLE')

  if (authorizedFloorIds.length === 0 || allowedCategories.length === 0) {
    return {
      success: true,
      data: {
        userId: actor.profile.id,
        authorizedFloorIds: [],
        allowedCategories: [],
        floors: [],
        allActiveFloors: allFloors,
        normalItems: [],
        idleItems: [],
        normalAssignments: [],
        idleAssignments: [],
        cachedAt: Date.now(),
      },
    }
  }

  try {
    let normalItems: any[] = []
    let normalAssignments: any[] = []
    let idleItems: any[] = []
    let idleAssignments: any[] = []

    // 4. If authorized for NEW or RUNNING: fetch normal master items & assignments
    if (hasRunning || hasNew) {
      // Assignments
      const { data: nAssign, error: nAssignErr } = await admin
        .from('normal_needle_floor_assignments')
        .select('needle_item_id, floor_id, entry_type')
        .in('floor_id', authorizedFloorIds)

      if (!nAssignErr && nAssign) {
        normalAssignments = nAssign
      } else if (nAssignErr && (nAssignErr.code === '42703' || nAssignErr.message?.includes('entry_type'))) {
        // Fallback without entry_type: assign to both running and new
        const fb = await admin
          .from('normal_needle_floor_assignments')
          .select('needle_item_id, floor_id')
          .in('floor_id', authorizedFloorIds)
        if (fb.data) {
          normalAssignments = [
            ...fb.data.map((a: any) => ({ ...a, entry_type: 'new' })),
            ...fb.data.map((a: any) => ({ ...a, entry_type: 'running' })),
          ]
        }
      }

      // Normal items
      const { data: nItems } = await admin
        .from('normal_needle_items')
        .select('id, item_code, needle_type, size_dia, brand, active')
        .eq('active', true)
        .order('item_code', { ascending: true })

      if (nItems) {
        normalItems = nItems
      }
    }

    // 5. If authorized for IDLE: fetch idle master items & assignments
    if (hasIdle) {
      const { data: iAssign } = await admin
        .from('idle_needle_floor_assignments')
        .select('needle_item_id, floor_id')
        .in('floor_id', authorizedFloorIds)

      if (iAssign) {
        idleAssignments = iAssign
      }

      const { data: iItems } = await admin
        .from('idle_needle_items')
        .select('id, item_code, needle_type, size_dia, brand, active')
        .eq('active', true)
        .order('item_code', { ascending: true })

      if (iItems) {
        idleItems = iItems
      }
    }

    return {
      success: true,
      data: {
        userId: actor.profile.id,
        authorizedFloorIds,
        allowedCategories,
        floors: authorizedFloors,
        allActiveFloors: allFloors,
        normalItems,
        idleItems,
        normalAssignments,
        idleAssignments,
        cachedAt: Date.now(),
      },
    }
  } catch (err: any) {
    console.error('[getAuthorizedNeedleMasterCacheAction] error:', err)
    return { success: false, error: err.message || 'Failed to load master cache.' }
  }
}

export async function getDailyEntrySheetAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
}): Promise<
  ActionResult<{
    rows: DailyEntryRowItem[]
    sheetId: string | null
    sheetStatus: 'draft' | 'posted' | 'closed'
    requisitionNo: string | null
    dbReady: boolean
  }>
> {
  const actor = await requireActiveAccount()

  // 1. Enforce Floor Authorization
  if (!isUserAuthorizedForFloor(actor, params.floorId)) {
    return { success: false, error: 'Unauthorized: You do not have access to this floor.' }
  }

  // 2. Enforce Category Authorization
  const hasCat = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, params.category)
  if (!hasCat) {
    return { success: false, error: `Unauthorized: You do not have permission for ${params.category} category.` }
  }

  const admin = getAdminClient()
  const tables = getCategoryTableNames(params.category)
  let dbReady = true

  try {
    // 3. Fetch Master Items assigned to this floor (filtered by NEW or RUNNING entry_type for normal needles)
    let assignQuery = admin
      .from(tables.floorAssignments)
      .select('needle_item_id')
      .eq('floor_id', params.floorId)

    if (params.category === 'NEW') {
      assignQuery = assignQuery.eq('entry_type', 'new')
    } else if (params.category === 'RUNNING') {
      assignQuery = assignQuery.eq('entry_type', 'running')
    }

    let { data: assignments, error: assignError } = await assignQuery

    // Fallback if entry_type column does not exist yet
    if (assignError && (assignError.code === '42703' || assignError.message?.includes('entry_type'))) {
      const fb = await admin
        .from(tables.floorAssignments)
        .select('needle_item_id')
        .eq('floor_id', params.floorId)
      assignments = fb.data
      assignError = fb.error
    }

    if (assignError) {
      if (['42P01', 'PGRST205'].includes(assignError.code)) {
        return {
          success: true,
          data: { rows: [], sheetId: null, sheetStatus: 'draft', requisitionNo: null, dbReady: false },
        }
      }
      throw assignError
    }

    const assignedItemIds = (assignments || []).map((a: any) => a.needle_item_id)
    if (assignedItemIds.length === 0) {
      return {
        success: true,
        data: { rows: [], sheetId: null, sheetStatus: 'draft', requisitionNo: null, dbReady: true },
      }
    }

    // 4. Fetch the needle specifications
    const { data: needleItems, error: itemsError } = await admin
      .from(tables.masterItems)
      .select('id, item_code, needle_type, size_dia, brand')
      .in('id', assignedItemIds)
      .order('item_code', { ascending: true })

    if (itemsError) throw itemsError

    // 5. Check/Fetch daily sheet header
    let sheetId: string | null = null
    let sheetStatus: 'draft' | 'posted' | 'closed' = 'draft'
    const { data: sheetData, error: sheetError } = await admin
      .from('needle_daily_sheets')
      .select('id, status, req_no')
      .eq('entry_date', params.date)
      .eq('floor_id', params.floorId)
      .eq('category', params.category)
      .maybeSingle()

    if (sheetError && ['42P01', 'PGRST205'].includes(sheetError.code)) {
      dbReady = false
    } else if (sheetData) {
      sheetId = sheetData.id
      sheetStatus = sheetData.status
    }

    // 6. Fetch historical and current day transactions for this floor and assigned items
    let transactions: any[] = []
    if (dbReady) {
      const { data: txData, error: txError } = await admin
        .from(tables.transactions)
        .select('needle_item_id, transaction_date, transaction_type, quantity, req_no, notes')
        .eq('floor_id', params.floorId)
        .in('needle_item_id', assignedItemIds)
        .lte('transaction_date', params.date)

      if (txError && ['42P01', 'PGRST205'].includes(txError.code)) {
        dbReady = false
      } else if (txData) {
        transactions = txData
      }
    }

    // 7. Fetch BNR records for the selected date
    let bnrRecords: any[] = []
    if (dbReady) {
      const { data: bnrData, error: bnrError } = await admin
        .from('needle_bnr_records')
        .select('needle_item_id, quantity')
        .eq('record_date', params.date)
        .eq('floor_id', params.floorId)
        .eq('category', params.category)

      if (bnrError && ['42P01', 'PGRST205'].includes(bnrError.code)) {
        dbReady = false
      } else if (bnrData) {
        bnrRecords = bnrData
      }
    }

    if (!dbReady) {
      return {
        success: true,
        data: { rows: [], sheetId: null, sheetStatus: 'draft', requisitionNo: null, dbReady: false },
      }
    }

    // 8. Calculate balances per needle item
    const bnrMap = new Map<string, number>()
    for (const b of bnrRecords) {
      bnrMap.set(b.needle_item_id, Number(b.quantity) || 0)
    }

    const rows: DailyEntryRowItem[] = (needleItems || []).map((item: any) => {
      const itemTx = transactions.filter((t: any) => t.needle_item_id === item.id)

      let previous = 0
      let received = 0
      let delivery = 0
      let transfer_in = 0
      let transfer_out = 0
      let adjustment = 0
      let req_no: string | null = null
      let last_transfer_note: string | null = null

      for (const tx of itemTx) {
        const qty = Number(tx.quantity) || 0
        const isPrior = tx.transaction_date < params.date
        const isCurrent = tx.transaction_date === params.date

        if (isPrior) {
          switch (tx.transaction_type) {
            case 'OPENING':
            case 'RECEIVE':
            case 'TRANSFER_IN':
            case 'ADJUSTMENT_IN':
              previous += qty
              break
            case 'ISSUE':
            case 'TRANSFER_OUT':
            case 'ADJUSTMENT_OUT':
              previous -= qty
              break
          }
        } else if (isCurrent) {
          if (tx.req_no) req_no = tx.req_no
          switch (tx.transaction_type) {
            case 'RECEIVE':
              received += qty
              break
            case 'ISSUE':
              delivery += qty
              break
            case 'TRANSFER_IN':
              transfer_in += qty
              if (tx.notes) last_transfer_note = tx.notes
              break
            case 'TRANSFER_OUT':
              transfer_out += qty
              if (tx.notes) last_transfer_note = tx.notes
              break
            case 'ADJUSTMENT_IN':
              adjustment += qty
              break
            case 'ADJUSTMENT_OUT':
              adjustment -= qty
              break
          }
        }
      }

      const present = previous + received + transfer_in - delivery - transfer_out + adjustment
      const bnr = bnrMap.get(item.id) || 0

      return {
        needle_item_id: item.id,
        item_code: item.item_code,
        needle_type: item.needle_type,
        size_dia: item.size_dia,
        brand: item.brand,
        previous,
        received,
        delivery,
        present,
        bnr,
        req_no,
        transfer_in,
        transfer_out,
        last_transfer_note,
      }
    })

    let sheetReqNo: string | null = (sheetData as any)?.req_no || null
    if (!sheetReqNo && transactions.length > 0) {
      const curReceive = transactions.find(
        (t: any) => t.transaction_date === params.date && t.transaction_type === 'RECEIVE' && t.req_no
      )
      if (curReceive?.req_no) {
        sheetReqNo = curReceive.req_no
      }
    }

    // If sheet has a requisition number, apply to rows with received > 0 if missing
    if (sheetReqNo) {
      for (const r of rows) {
        if (r.received > 0 && !r.req_no) {
          r.req_no = sheetReqNo
        }
      }
    }

    return {
      success: true,
      data: {
        rows,
        sheetId,
        sheetStatus,
        requisitionNo: sheetReqNo,
        dbReady: true,
      },
    }
  } catch (err: any) {
    console.error('[getDailyEntrySheetAction] error:', err)
    return { success: false, error: err.message || 'Failed to load daily entry sheet.' }
  }
}

/**
 * Save an editable cell (RCVD, DVLD, BNR) for a needle row.
 */
export async function saveDailyEntryCellAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
  needleItemId: string
  field: 'received' | 'delivery' | 'bnr'
  value: number
  reqNo?: string | null
  clientOperationId?: string | null
}): Promise<
  ActionResult<{
    previous: number
    received: number
    delivery: number
    present: number
    bnr: number
    req_no: string | null
  }>
> {
  const actor = await requireActiveAccount()

  // 1. Authorization checks
  if (!isUserAuthorizedForFloor(actor, params.floorId)) {
    return { success: false, error: 'Unauthorized: You do not have access to this floor.' }
  }
  const hasCat = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, params.category)
  if (!hasCat) {
    return { success: false, error: `Unauthorized: You do not have permission for ${params.category} category.` }
  }

  if (params.value < 0 || isNaN(params.value)) {
    return { success: false, error: 'Value must be a positive number.' }
  }

  const admin = getAdminClient()
  const tables = getCategoryTableNames(params.category)

  try {
    // 2. Ensure daily sheet header exists
    let sheetId: string | null = null
    const { data: existingSheet } = await admin
      .from('needle_daily_sheets')
      .select('id, status, req_no')
      .eq('entry_date', params.date)
      .eq('floor_id', params.floorId)
      .eq('category', params.category)
      .maybeSingle()

    if (existingSheet) {
      sheetId = existingSheet.id
    } else {
      const { data: newSheet, error: newSheetErr } = await admin
        .from('needle_daily_sheets')
        .insert({
          entry_date: params.date,
          floor_id: params.floorId,
          category: params.category,
          status: 'draft',
          created_by: actor.profile.id,
          updated_by: actor.profile.id,
        })
        .select('id')
        .single()

      if (newSheetErr) {
        // If conflict due to concurrent save, retry select
        const { data: retrySheet } = await admin
          .from('needle_daily_sheets')
          .select('id')
          .eq('entry_date', params.date)
          .eq('floor_id', params.floorId)
          .eq('category', params.category)
          .single()
        sheetId = retrySheet?.id || null
      } else {
        sheetId = newSheet.id
        await createAuditLog({
          actorUserId: actor.profile.id,
          eventType: 'NEEDLE_DAILY_SHEET_CREATED',
          entityType: 'needle_daily_sheets',
          entityId: sheetId ?? undefined,
          newData: { entry_date: params.date, floor_id: params.floorId, category: params.category },
        })
      }
    }

    // 3. Handle BNR save (BNR does NOT affect stock ledger)
    if (params.field === 'bnr') {
      const { data: existingBnr } = await admin
        .from('needle_bnr_records')
        .select('id, quantity')
        .eq('record_date', params.date)
        .eq('floor_id', params.floorId)
        .eq('needle_item_id', params.needleItemId)
        .eq('category', params.category)
        .maybeSingle()

      if (params.value > 0) {
        await admin.from('needle_bnr_records').upsert(
          {
            record_date: params.date,
            daily_sheet_id: sheetId,
            floor_id: params.floorId,
            needle_item_id: params.needleItemId,
            category: params.category,
            quantity: params.value,
            updated_by: actor.profile.id,
          },
          { onConflict: 'record_date,floor_id,needle_item_id,category' }
        )
      } else if (existingBnr) {
        await admin.from('needle_bnr_records').delete().eq('id', existingBnr.id)
      }

      await createAuditLog({
        actorUserId: actor.profile.id,
        eventType: 'NEEDLE_DAILY_BNR_SAVED',
        entityType: 'needle_bnr_records',
        entityId: existingBnr?.id || params.needleItemId,
        oldData: { quantity: existingBnr?.quantity ?? 0 },
        newData: { quantity: params.value, date: params.date, floor_id: params.floorId },
      })
    }

    // 4. Handle Stock Transaction Save (RECEIVE or ISSUE)
    if (params.field === 'received' || params.field === 'delivery') {
      const targetType: DailyTransactionType = params.field === 'received' ? 'RECEIVE' : 'ISSUE'

      // Fetch all transactions for this needle on this floor up to this date to validate stock
      const { data: allTx, error: txFetchErr } = await admin
        .from(tables.transactions)
        .select('id, transaction_date, transaction_type, quantity, req_no')
        .eq('floor_id', params.floorId)
        .eq('needle_item_id', params.needleItemId)
        .lte('transaction_date', params.date)

      if (txFetchErr) throw txFetchErr

      let previous = 0
      let curReceived = 0
      let curTransferIn = 0
      let existingTargetTx: any = null

      for (const t of allTx || []) {
        const qty = Number(t.quantity) || 0
        const isPrior = t.transaction_date < params.date
        const isCurrent = t.transaction_date === params.date

        if (isPrior) {
          if (['OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(t.transaction_type)) previous += qty
          if (['ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'].includes(t.transaction_type)) previous -= qty
        } else if (isCurrent) {
          if (t.transaction_type === 'RECEIVE') curReceived += qty
          if (t.transaction_type === 'TRANSFER_IN') curTransferIn += qty
          if (t.transaction_type === targetType) existingTargetTx = t
        }
      }

      // Delivery validation: Delivery cannot exceed (previous + received + transfer_in)
      if (params.field === 'delivery') {
        const effectiveReceived = curReceived
        const availableStock = previous + effectiveReceived + curTransferIn
        if (params.value > availableStock) {
          return {
            success: false,
            error: `Delivery quantity (${params.value}) exceeds available stock (${availableStock}).`,
          }
        }
      }

      // Upsert or remove transaction row
      if (params.value > 0) {
        let reqNo: string | null = null
        if (targetType === 'RECEIVE') {
          reqNo = params.reqNo?.trim() || existingSheet?.req_no || existingTargetTx?.req_no || null
          if (sheetId && reqNo) {
            try {
              await admin.from('needle_daily_sheets').update({ req_no: reqNo, updated_by: actor.profile.id }).eq('id', sheetId)
            } catch {}
            try {
              await admin
                .from(tables.transactions)
                .update({ req_no: reqNo, updated_by: actor.profile.id })
                .eq('daily_sheet_id', sheetId)
                .eq('transaction_type', 'RECEIVE')
                .is('req_no', null)
            } catch {}
          }
        }

        if (existingTargetTx) {
          await admin
            .from(tables.transactions)
            .update({
              quantity: params.value,
              daily_sheet_id: sheetId,
              updated_by: actor.profile.id,
              ...(targetType === 'RECEIVE' ? { req_no: reqNo || existingTargetTx.req_no } : {}),
            })
            .eq('id', existingTargetTx.id)
        } else {
          await admin.from(tables.transactions).insert({
            transaction_date: params.date,
            floor_id: params.floorId,
            needle_item_id: params.needleItemId,
            transaction_type: targetType,
            quantity: params.value,
            req_no: reqNo,
            daily_sheet_id: sheetId,
            created_by: actor.profile.id,
            updated_by: actor.profile.id,
          })
        }

        await createAuditLog({
          actorUserId: actor.profile.id,
          eventType:
            targetType === 'RECEIVE' ? 'NEEDLE_DAILY_RECEIVE_SAVED' : 'NEEDLE_DAILY_ISSUE_SAVED',
          entityType: tables.transactions,
          entityId: existingTargetTx?.id || params.needleItemId,
          oldData: { quantity: existingTargetTx?.quantity ?? 0 },
          newData: { quantity: params.value, type: targetType, date: params.date, floor_id: params.floorId },
        })
      } else if (existingTargetTx) {
        // Zero row rule: remove zero transaction
        await admin.from(tables.transactions).delete().eq('id', existingTargetTx.id)
        await createAuditLog({
          actorUserId: actor.profile.id,
          eventType:
            targetType === 'RECEIVE' ? 'NEEDLE_DAILY_RECEIVE_SAVED' : 'NEEDLE_DAILY_ISSUE_SAVED',
          entityType: tables.transactions,
          entityId: existingTargetTx.id,
          oldData: { quantity: existingTargetTx.quantity },
          newData: { quantity: 0, removed: true },
        })
      }
    }

    // 5. Recalculate and return updated balances for the row
    const updatedSheetRes = await getDailyEntrySheetAction({
      date: params.date,
      floorId: params.floorId,
      category: params.category,
    })

    if (!updatedSheetRes.success || !updatedSheetRes.data) {
      throw new Error('Failed to refresh balances after save')
    }

    const updatedRow = updatedSheetRes.data.rows.find((r) => r.needle_item_id === params.needleItemId)
    if (!updatedRow) {
      throw new Error('Needle row not found after update')
    }

    revalidatePath('/running-needle/daily-entry')
    revalidatePath('/new-needle/daily-entry')
    revalidatePath('/idle-needle/daily-entry')
    revalidatePath('/needle/daily-entry')
    revalidatePath('/needle/daily-entry')
    revalidatePath('/broken-needle/daily-entry')

    return {
      success: true,
      data: {
        previous: updatedRow.previous,
        received: updatedRow.received,
        delivery: updatedRow.delivery,
        present: updatedRow.present,
        bnr: updatedRow.bnr,
        req_no: updatedRow.req_no,
      },
    }
  } catch (err: any) {
    console.error('[saveDailyEntryCellAction] error:', err)
    return { success: false, error: err.message || 'Failed to save daily entry value.' }
  }
}

/**
 * Execute an atomic floor-to-floor needle stock transfer.
 */
export async function transferFloorStockAction(params: {
  date: string
  fromFloorId: string
  toFloorId: string
  category: DailyEntryCategory
  needleItemId: string
  quantity: number
  receiverName: string
  reqNo?: string
}): Promise<ActionResult<{ remainingStock: number }>> {
  const actor = await requireActiveAccount()

  // 1. Authorization & validations
  if (!isUserAuthorizedForFloor(actor, params.fromFloorId)) {
    return { success: false, error: 'Unauthorized: You do not have permission for the source floor.' }
  }
  const hasCat = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, params.category)
  if (!hasCat) {
    return { success: false, error: `Unauthorized: You do not have permission for ${params.category} category.` }
  }
  if (params.fromFloorId === params.toFloorId) {
    return { success: false, error: 'Destination floor must be different from source floor.' }
  }
  if (params.quantity <= 0 || isNaN(params.quantity)) {
    return { success: false, error: 'Transfer quantity must be greater than zero.' }
  }
  if (!params.receiverName?.trim()) {
    return { success: false, error: 'Receiver name is required.' }
  }

  const admin = getAdminClient()
  const reqNumber = params.reqNo?.trim() || (await generateReqNo(params.date))

  try {
    // Attempt RPC first (defined in migration)
    const { data: rpcResult, error: rpcErr } = await admin.rpc('transfer_needle_stock_atomic', {
      p_category: params.category,
      p_from_floor_id: params.fromFloorId,
      p_to_floor_id: params.toFloorId,
      p_needle_item_id: params.needleItemId,
      p_quantity: params.quantity,
      p_transaction_date: params.date,
      p_req_no: reqNumber,
      p_receiver_name: params.receiverName.trim(),
      p_actor_id: actor.profile.id,
    })

    if (rpcErr) {
      // If RPC is missing in schema, execute fallback with strict balance check
      if (['42883', 'PGRST202'].includes(rpcErr.code)) {
        const tables = getCategoryTableNames(params.category)

        // Verify available stock on source floor
        const { data: txs, error: fetchErr } = await admin
          .from(tables.transactions)
          .select('transaction_type, quantity')
          .eq('floor_id', params.fromFloorId)
          .eq('needle_item_id', params.needleItemId)
          .lte('transaction_date', params.date)

        if (fetchErr) throw fetchErr

        let available = 0
        for (const t of txs || []) {
          const q = Number(t.quantity) || 0
          if (['OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(t.transaction_type)) available += q
          if (['ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'].includes(t.transaction_type)) available -= q
        }

        if (params.quantity > available) {
          return {
            success: false,
            error: `Transfer rejected: requested quantity (${params.quantity}) exceeds available stock (${available}).`,
          }
        }

        const { data: toFloor } = await admin.from('floors').select('name').eq('id', params.toFloorId).single()
        const { data: fromFloor } = await admin.from('floors').select('name').eq('id', params.fromFloorId).single()

        // Insert TRANSFER_OUT
        await admin.from(tables.transactions).insert({
          transaction_date: params.date,
          floor_id: params.fromFloorId,
          needle_item_id: params.needleItemId,
          transaction_type: 'TRANSFER_OUT',
          quantity: params.quantity,
          req_no: reqNumber,
          notes: `To: ${toFloor?.name || 'Floor'} | Receiver: ${params.receiverName.trim()}`,
          created_by: actor.profile.id,
          updated_by: actor.profile.id,
        })

        // Insert TRANSFER_IN
        await admin.from(tables.transactions).insert({
          transaction_date: params.date,
          floor_id: params.toFloorId,
          needle_item_id: params.needleItemId,
          transaction_type: 'TRANSFER_IN',
          quantity: params.quantity,
          req_no: reqNumber,
          notes: `From: ${fromFloor?.name || 'Floor'} | Receiver: ${params.receiverName.trim()}`,
          created_by: actor.profile.id,
          updated_by: actor.profile.id,
        })

        await createAuditLog({
          actorUserId: actor.profile.id,
          eventType: 'NEEDLE_DAILY_TRANSFER_EXECUTED',
          entityType: tables.transactions,
          entityId: params.needleItemId,
          newData: {
            from_floor: params.fromFloorId,
            to_floor: params.toFloorId,
            quantity: params.quantity,
            receiver: params.receiverName.trim(),
            req_no: reqNumber,
          },
        })

        revalidatePath('/needle/daily-entry')
        revalidatePath('/broken-needle/daily-entry')
        revalidatePath('/idle-needle/daily-entry')
    revalidatePath('/needle/daily-entry')

        return { success: true, data: { remainingStock: available - params.quantity } }
      }

      throw rpcErr
    }

    await createAuditLog({
      actorUserId: actor.profile.id,
      eventType: 'NEEDLE_DAILY_TRANSFER_EXECUTED',
      entityType: 'needle_transfers',
      entityId: params.needleItemId,
      newData: {
        from_floor: params.fromFloorId,
        to_floor: params.toFloorId,
        quantity: params.quantity,
        receiver: params.receiverName.trim(),
        req_no: reqNumber,
      },
    })

    revalidatePath('/running-needle/daily-entry')
    revalidatePath('/new-needle/daily-entry')
    revalidatePath('/idle-needle/daily-entry')
    revalidatePath('/needle/daily-entry')
    revalidatePath('/needle/daily-entry')
    revalidatePath('/broken-needle/daily-entry')

    return {
      success: true,
      data: { remainingStock: (rpcResult as any)?.remaining_stock ?? 0 },
    }
  } catch (err: any) {
    console.error('[transferFloorStockAction] error:', err)
    return { success: false, error: err.message || 'Transfer failed.' }
  }
}

/**
 * Update the requisition number for a floor's daily sheet and sync across all receive rows.
 */
export async function updateSheetRequisitionNoAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
  reqNo: string
}): Promise<ActionResult<{ requisitionNo: string }>> {
  const actor = await requireActiveAccount()
  if (!isUserAuthorizedForFloor(actor, params.floorId)) {
    return { success: false, error: 'Unauthorized: You do not have access to this floor.' }
  }

  const cleanReqNo = params.reqNo?.trim()
  if (!cleanReqNo) {
    return { success: false, error: 'Requisition number cannot be empty.' }
  }

  const admin = getAdminClient()
  const tables = getCategoryTableNames(params.category)

  try {
    // 1. Update or create sheet header with req_no
    const { data: sheet } = await admin
      .from('needle_daily_sheets')
      .select('id')
      .eq('entry_date', params.date)
      .eq('floor_id', params.floorId)
      .eq('category', params.category)
      .maybeSingle()

    let sheetId = sheet?.id
    if (sheetId) {
      await admin
        .from('needle_daily_sheets')
        .update({ req_no: cleanReqNo, updated_by: actor.profile.id })
        .eq('id', sheetId)
    } else {
      const { data: newSheet } = await admin
        .from('needle_daily_sheets')
        .insert({
          entry_date: params.date,
          floor_id: params.floorId,
          category: params.category,
          req_no: cleanReqNo,
          created_by: actor.profile.id,
          updated_by: actor.profile.id,
        })
        .select('id')
        .single()
      sheetId = newSheet?.id
    }

    // 2. Sync req_no across all current day RECEIVE transactions for this floor
    await admin
      .from(tables.transactions)
      .update({ req_no: cleanReqNo, updated_by: actor.profile.id })
      .eq('floor_id', params.floorId)
      .eq('transaction_date', params.date)
      .eq('transaction_type', 'RECEIVE')

    revalidatePath('/running-needle/daily-entry')
    revalidatePath('/new-needle/daily-entry')
    revalidatePath('/idle-needle/daily-entry')
    revalidatePath('/needle/daily-entry')

    return { success: true, data: { requisitionNo: cleanReqNo } }
  } catch (err: any) {
    console.error('[updateSheetRequisitionNoAction] error:', err)
    return { success: false, error: err.message || 'Failed to update requisition number.' }
  }
}

/**
 * Update the requisition number for a specific needle row's receive transaction,
 * with option to apply to all remaining receive rows for the floor session.
 */
export async function updateRowRequisitionNoAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
  needleItemId: string
  reqNo: string
  applyToAll?: boolean
}): Promise<ActionResult<{ requisitionNo: string; applyToAll: boolean }>> {
  const actor = await requireActiveAccount()
  if (!isUserAuthorizedForFloor(actor, params.floorId)) {
    return { success: false, error: 'Unauthorized: You do not have access to this floor.' }
  }

  const cleanReqNo = params.reqNo?.trim()
  if (!cleanReqNo) {
    return { success: false, error: 'Requisition number cannot be empty.' }
  }

  const admin = getAdminClient()
  const tables = getCategoryTableNames(params.category)
  const applyToAll = params.applyToAll ?? false

  try {
    if (applyToAll) {
      // 1. Update sheet header with req_no
      const { data: sheet } = await admin
        .from('needle_daily_sheets')
        .select('id')
        .eq('entry_date', params.date)
        .eq('floor_id', params.floorId)
        .eq('category', params.category)
        .maybeSingle()

      if (sheet?.id) {
        await admin
          .from('needle_daily_sheets')
          .update({ req_no: cleanReqNo, updated_by: actor.profile.id })
          .eq('id', sheet.id)
      }

      // 2. Sync req_no across ALL current day RECEIVE transactions for this floor
      await admin
        .from(tables.transactions)
        .update({ req_no: cleanReqNo, updated_by: actor.profile.id })
        .eq('floor_id', params.floorId)
        .eq('transaction_date', params.date)
        .eq('transaction_type', 'RECEIVE')
    } else {
      // Update ONLY this specific needle item's RECEIVE transaction
      await admin
        .from(tables.transactions)
        .update({ req_no: cleanReqNo, updated_by: actor.profile.id })
        .eq('floor_id', params.floorId)
        .eq('transaction_date', params.date)
        .eq('needle_item_id', params.needleItemId)
        .eq('transaction_type', 'RECEIVE')
    }

    revalidatePath('/running-needle/daily-entry')
    revalidatePath('/new-needle/daily-entry')
    revalidatePath('/idle-needle/daily-entry')
    revalidatePath('/needle/daily-entry')

    return { success: true, data: { requisitionNo: cleanReqNo, applyToAll } }
  } catch (err: any) {
    console.error('[updateRowRequisitionNoAction] error:', err)
    return { success: false, error: err.message || 'Failed to update row requisition number.' }
  }
}


export interface BatchSyncOperationInput {
  id: string
  client_operation_id: string
  needle_item_id: string
  field: 'received' | 'delivery' | 'bnr'
  value: number
  req_no?: string | null
}

export interface BatchSyncOperationResult {
  id: string
  client_operation_id: string
  success: boolean
  error?: string
  isConflict?: boolean
}

/**
 * Synchronize a batch of pending local operations with server idempotency and stock validation.
 */
export async function batchSyncDailyEntryAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
  operations: BatchSyncOperationInput[]
}): Promise<
  ActionResult<{
    results: BatchSyncOperationResult[]
    rows: DailyEntryRowItem[]
    requisitionNo: string | null
    sheetId: string | null
  }>
> {
  const actor = await requireActiveAccount()

  if (!isUserAuthorizedForFloor(actor, params.floorId)) {
    return { success: false, error: 'Unauthorized: You do not have access to this floor.' }
  }
  const hasCat = await canAccessCategory(actor.profile.id, actor.isSiteAdmin, params.category)
  if (!hasCat) {
    return { success: false, error: `Unauthorized: You do not have permission for ${params.category} category.` }
  }

  if (!params.operations || params.operations.length === 0) {
    const sheetRes = await getDailyEntrySheetAction({
      date: params.date,
      floorId: params.floorId,
      category: params.category,
    })
    return {
      success: true,
      data: {
        results: [],
        rows: sheetRes.data?.rows || [],
        requisitionNo: sheetRes.data?.requisitionNo || null,
        sheetId: sheetRes.data?.sheetId || null,
      },
    }
  }

  const admin = getAdminClient()
  const tables = getCategoryTableNames(params.category)

  try {
    // 1. Ensure daily sheet header exists
    let sheetId: string | null = null
    const { data: existingSheet } = await admin
      .from('needle_daily_sheets')
      .select('id, req_no')
      .eq('entry_date', params.date)
      .eq('floor_id', params.floorId)
      .eq('category', params.category)
      .maybeSingle()

    if (existingSheet) {
      sheetId = existingSheet.id
    } else {
      const { data: newSheet, error: newSheetErr } = await admin
        .from('needle_daily_sheets')
        .insert({
          entry_date: params.date,
          floor_id: params.floorId,
          category: params.category,
          status: 'draft',
          created_by: actor.profile.id,
          updated_by: actor.profile.id,
        })
        .select('id')
        .single()

      if (newSheetErr) {
        const { data: retrySheet } = await admin
          .from('needle_daily_sheets')
          .select('id')
          .eq('entry_date', params.date)
          .eq('floor_id', params.floorId)
          .eq('category', params.category)
          .single()
        sheetId = retrySheet?.id || null
      } else {
        sheetId = newSheet.id
      }
    }

    const results: BatchSyncOperationResult[] = []

    let currentSheetReqNo: string | null = existingSheet?.req_no || null
    for (const op of params.operations) {
      if (op.req_no && !currentSheetReqNo) {
        currentSheetReqNo = op.req_no.trim()
      }
    }

    // 2. Process each operation sequentially with validation
    for (const op of params.operations) {
      try {
        if (op.value < 0 || isNaN(op.value)) {
          results.push({
            id: op.id,
            client_operation_id: op.client_operation_id,
            success: false,
            error: 'Value must be a positive number.',
          })
          continue
        }

        // BNR Field
        if (op.field === 'bnr') {
          // Idempotency check
          const { data: idempotentBnr } = await admin
            .from('needle_bnr_records')
            .select('id')
            .eq('client_operation_id', op.client_operation_id)
            .maybeSingle()

          if (idempotentBnr) {
            results.push({
              id: op.id,
              client_operation_id: op.client_operation_id,
              success: true,
            })
            continue
          }

          if (op.value > 0) {
            await admin.from('needle_bnr_records').upsert(
              {
                record_date: params.date,
                daily_sheet_id: sheetId,
                floor_id: params.floorId,
                needle_item_id: op.needle_item_id,
                category: params.category,
                quantity: op.value,
                updated_by: actor.profile.id,
                client_operation_id: op.client_operation_id,
              },
              { onConflict: 'record_date,floor_id,needle_item_id,category' }
            )
          } else {
            await admin
              .from('needle_bnr_records')
              .delete()
              .eq('record_date', params.date)
              .eq('floor_id', params.floorId)
              .eq('needle_item_id', op.needle_item_id)
              .eq('category', params.category)
          }

          results.push({
            id: op.id,
            client_operation_id: op.client_operation_id,
            success: true,
          })
          continue
        }

        // Stock Transactions (RECEIVED or DELIVERY)
        const targetType: DailyTransactionType = op.field === 'received' ? 'RECEIVE' : 'ISSUE'

        // Idempotency check
        const { data: idempotentTx } = await admin
          .from(tables.transactions)
          .select('id')
          .eq('client_operation_id', op.client_operation_id)
          .maybeSingle()

        if (idempotentTx) {
          results.push({
            id: op.id,
            client_operation_id: op.client_operation_id,
            success: true,
          })
          continue
        }

        // Fetch historical + current transactions for accurate stock validation
        const { data: allTx, error: txFetchErr } = await admin
          .from(tables.transactions)
          .select('id, transaction_date, transaction_type, quantity, req_no')
          .eq('floor_id', params.floorId)
          .eq('needle_item_id', op.needle_item_id)
          .lte('transaction_date', params.date)

        if (txFetchErr) throw txFetchErr

        let previous = 0
        let curReceived = 0
        let curTransferIn = 0
        let existingTargetTx: any = null

        for (const t of allTx || []) {
          const qty = Number(t.quantity) || 0
          const isPrior = t.transaction_date < params.date
          const isCurrent = t.transaction_date === params.date

          if (isPrior) {
            if (['OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(t.transaction_type)) previous += qty
            if (['ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'].includes(t.transaction_type)) previous -= qty
          } else if (isCurrent) {
            if (t.transaction_type === 'RECEIVE') curReceived += qty
            if (t.transaction_type === 'TRANSFER_IN') curTransferIn += qty
            if (t.transaction_type === targetType) existingTargetTx = t
          }
        }

        // Server-side Stock Validation for DELIVERY
        if (op.field === 'delivery') {
          const availableStock = previous + curReceived + curTransferIn
          if (op.value > availableStock) {
            results.push({
              id: op.id,
              client_operation_id: op.client_operation_id,
              success: false,
              isConflict: true,
              error: `Delivery quantity (${op.value}) exceeds available stock (${availableStock}).`,
            })
            continue
          }
        }

        // Apply ledger transaction
        if (op.value > 0) {
          let reqNo: string | null = null
          if (targetType === 'RECEIVE') {
            reqNo = op.req_no?.trim() || currentSheetReqNo || existingTargetTx?.req_no || null
            if (sheetId && reqNo) {
              currentSheetReqNo = reqNo
              try {
                await admin.from('needle_daily_sheets').update({ req_no: reqNo, updated_by: actor.profile.id }).eq('id', sheetId)
              } catch {}
              try {
                await admin
                  .from(tables.transactions)
                  .update({ req_no: reqNo, updated_by: actor.profile.id })
                  .eq('daily_sheet_id', sheetId)
                  .eq('transaction_type', 'RECEIVE')
                  .is('req_no', null)
              } catch {}
            }
          }

          if (existingTargetTx) {
            await admin
              .from(tables.transactions)
              .update({
                quantity: op.value,
                daily_sheet_id: sheetId,
                updated_by: actor.profile.id,
                client_operation_id: op.client_operation_id,
                ...(targetType === 'RECEIVE' ? { req_no: reqNo || existingTargetTx.req_no } : {}),
              })
              .eq('id', existingTargetTx.id)
          } else {
            await admin.from(tables.transactions).insert({
              transaction_date: params.date,
              floor_id: params.floorId,
              needle_item_id: op.needle_item_id,
              transaction_type: targetType,
              quantity: op.value,
              req_no: reqNo,
              daily_sheet_id: sheetId,
              client_operation_id: op.client_operation_id,
              created_by: actor.profile.id,
              updated_by: actor.profile.id,
            })
          }
        } else if (existingTargetTx) {
          await admin.from(tables.transactions).delete().eq('id', existingTargetTx.id)
        }

        results.push({
          id: op.id,
          client_operation_id: op.client_operation_id,
          success: true,
        })
      } catch (opErr: any) {
        results.push({
          id: op.id,
          client_operation_id: op.client_operation_id,
          success: false,
          error: opErr.message || 'Operation failed',
        })
      }
    }

    // 3. Recalculate sheet rows once after processing all batch operations
    const updatedSheetRes = await getDailyEntrySheetAction({
      date: params.date,
      floorId: params.floorId,
      category: params.category,
    })

    revalidatePath('/running-needle/daily-entry')
    revalidatePath('/new-needle/daily-entry')
    revalidatePath('/idle-needle/daily-entry')
    revalidatePath('/needle/daily-entry')

    return {
      success: true,
      data: {
        results,
        rows: updatedSheetRes.data?.rows || [],
        requisitionNo: updatedSheetRes.data?.requisitionNo || null,
        sheetId: updatedSheetRes.data?.sheetId || null,
      },
    }
  } catch (err: any) {
    console.error('[batchSyncDailyEntryAction] error:', err)
    return { success: false, error: err.message || 'Failed to sync daily entry batch.' }
  }
}

/**
 * Helper to fetch all rows paginated in chunks of 1000 to prevent silent PostgREST truncation.
 */
async function fetchAllRowsPaginated<T = any>(
  buildQuery: () => any,
  pageSize = 1000
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allRows.push(...data)
      if (data.length < pageSize) {
        hasMore = false
      } else {
        from += pageSize
      }
    }
  }

  return allRows
}

/**
 * Helper to compute date range YYYY-MM-DD
 */
function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const curr = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  while (curr <= end) {
    const yr = curr.getFullYear()
    const mo = String(curr.getMonth() + 1).padStart(2, '0')
    const dy = String(curr.getDate()).padStart(2, '0')
    dates.push(`${yr}-${mo}-${dy}`)
    curr.setDate(curr.getDate() + 1)
  }
  return dates
}

/**
 * Load offline stock history (1 month past baseline, authoritative snapshots, and movements) for authorized floors.
 */
export async function getOfflineStockHistorySyncAction(params?: {
  floorIds?: string[]
  categories?: DailyEntryCategory[]
  since?: number
  windowStartDate?: string
  windowEndDate?: string
}): Promise<ActionResult<OfflineStockHistorySyncData>> {
  const actor = await requireActiveAccount()
  const admin = getAdminClient()

  // 1. Determine authorized floors
  const { data: allFloors } = await admin
    .from('floors')
    .select('id, code, name')
    .eq('active', true)

  const authorizedFloors = actor.isSiteAdmin
    ? (allFloors || [])
    : (allFloors || []).filter((f: any) => isUserAuthorizedForFloor(actor, f.id))

  let targetFloorIds = authorizedFloors.map((f: any) => f.id)
  if (params?.floorIds && params.floorIds.length > 0) {
    targetFloorIds = targetFloorIds.filter((id: string) => params.floorIds!.includes(id))
  }

  // 2. Rolling window: Past 1 Calendar Month through Future 1 Calendar Month
  const toYMD = (d: Date) => {
    const yr = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const dy = String(d.getDate()).padStart(2, '0')
    return `${yr}-${mo}-${dy}`
  }

  const now = new Date()
  const todayDate = toYMD(now)

  let windowStartDate = params?.windowStartDate
  let windowEndDate = params?.windowEndDate

  if (!windowStartDate || !windowEndDate) {
    const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
    windowStartDate = toYMD(past)
    windowEndDate = todayDate
  }

  const syncBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  if (targetFloorIds.length === 0) {
    return {
      success: true,
      data: {
        userId: actor.profile.id,
        syncBatchId,
        windowStartDate,
        windowEndDate,
        targetFloorIds: [],
        categories: [],
        snapshots: [],
        baselines: [],
        movements: [],
        sheets: [],
        assignedNeedleCounts: {},
        syncedAt: Date.now(),
        isIncremental: !!params?.since,
      },
    }
  }

  // 3. Allowed categories
  const allowedCategories: DailyEntryCategory[] = []
  if (await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'RUNNING')) allowedCategories.push('RUNNING')
  if (await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'NEW')) allowedCategories.push('NEW')
  if (await canAccessCategory(actor.profile.id, actor.isSiteAdmin, 'IDLE')) allowedCategories.push('IDLE')

  let targetCategories = allowedCategories
  if (params?.categories && params.categories.length > 0) {
    targetCategories = targetCategories.filter((c) => allowedCategories.includes(c))
  }

  const baselines: StockBaselineRecord[] = []
  const movements: StockMovementRecord[] = []
  const sheets: CachedSheetHeader[] = []
  const snapshots: DailyStockSnapshotRecord[] = []
  const assignedNeedleCounts: Record<string, number> = {}

  try {
    for (const cat of targetCategories) {
      const tables = getCategoryTableNames(cat)

      // Step A: Load assigned needles for target floors
      const floorAssignedMap = new Map<string, string[]>()
      if (cat === 'IDLE') {
        const idleAssigns = await fetchAllRowsPaginated(() =>
          admin
            .from('needle_idle_floor_assignments')
            .select('floor_id, needle_item_id')
            .in('floor_id', targetFloorIds)
            .eq('active', true)
        )
        for (const a of idleAssigns) {
          if (!floorAssignedMap.has(a.floor_id)) floorAssignedMap.set(a.floor_id, [])
          floorAssignedMap.get(a.floor_id)!.push(a.needle_item_id)
        }
      } else {
        const entryType = cat === 'RUNNING' ? 'running' : 'new'
        let normAssigns: any[] = []
        try {
          normAssigns = await fetchAllRowsPaginated(() =>
            admin
              .from('needle_floor_assignments')
              .select('floor_id, needle_item_id')
              .in('floor_id', targetFloorIds)
              .eq('entry_type', entryType)
              .eq('active', true)
          )
        } catch {
          // Fallback if entry_type column not present
          normAssigns = await fetchAllRowsPaginated(() =>
            admin
              .from('needle_floor_assignments')
              .select('floor_id, needle_item_id')
              .in('floor_id', targetFloorIds)
              .eq('active', true)
          )
        }
        for (const a of normAssigns) {
          if (!floorAssignedMap.has(a.floor_id)) floorAssignedMap.set(a.floor_id, [])
          floorAssignedMap.get(a.floor_id)!.push(a.needle_item_id)
        }
      }

      for (const floorId of targetFloorIds) {
        const count = (floorAssignedMap.get(floorId) || []).length
        assignedNeedleCounts[`${floorId}:${cat}`] = count
      }

      // Step B: Baseline balances before windowStartDate (< windowStartDate) with pagination
      const priorTxRows = await fetchAllRowsPaginated(() =>
        admin
          .from(tables.transactions)
          .select('floor_id, needle_item_id, transaction_type, quantity')
          .in('floor_id', targetFloorIds)
          .lt('transaction_date', windowStartDate)
      )

      const balanceMap = new Map<string, number>()
      for (const tx of priorTxRows) {
        const key = `${tx.floor_id}:${tx.needle_item_id}`
        const qty = Number(tx.quantity) || 0
        let delta = 0
        if (['OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(tx.transaction_type)) delta = qty
        if (['ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'].includes(tx.transaction_type)) delta = -qty
        balanceMap.set(key, (balanceMap.get(key) || 0) + delta)
      }

      // Guarantee baseline balance for every assigned needle (0 if no prior tx)
      for (const floorId of targetFloorIds) {
        const assignedIds = floorAssignedMap.get(floorId) || []
        for (const needleId of assignedIds) {
          const key = `${floorId}:${needleId}`
          if (!balanceMap.has(key)) {
            balanceMap.set(key, 0)
          }
          const bal = balanceMap.get(key)!
          baselines.push({
            id: `${floorId}:${cat}:${needleId}`,
            floor_id: floorId,
            category: cat,
            needle_item_id: needleId,
            baseline_date: windowStartDate,
            balance: bal,
            updated_at: Date.now(),
          })
        }
      }

      // Step C: All transactions in window [windowStartDate, windowEndDate] with pagination
      const allTxInWindow = await fetchAllRowsPaginated(() =>
        admin
          .from(tables.transactions)
          .select('id, transaction_date, floor_id, needle_item_id, transaction_type, quantity, req_no, notes, updated_at')
          .in('floor_id', targetFloorIds)
          .gte('transaction_date', windowStartDate)
          .lte('transaction_date', windowEndDate)
      )

      // Step D: Sheet headers within the window
      const allSheetsInWindow = await fetchAllRowsPaginated(() =>
        admin
          .from('needle_daily_sheets')
          .select('id, entry_date, floor_id, category, req_no, status, updated_at')
          .in('floor_id', targetFloorIds)
          .eq('category', cat)
          .gte('entry_date', windowStartDate)
          .lte('entry_date', windowEndDate)
      )

      // Filter movements and sheet headers if incremental sync
      const changedTxRows = params?.since
        ? allTxInWindow.filter((tx: any) => new Date(tx.updated_at).getTime() > params.since!)
        : allTxInWindow
      const changedSheetRows = params?.since
        ? allSheetsInWindow.filter((s: any) => new Date(s.updated_at).getTime() > params.since!)
        : allSheetsInWindow

      for (const tx of changedTxRows) {
        movements.push({
          id: tx.id,
          transaction_date: tx.transaction_date,
          floor_id: tx.floor_id,
          category: cat,
          needle_item_id: tx.needle_item_id,
          transaction_type: tx.transaction_type,
          quantity: Number(tx.quantity) || 0,
          req_no: tx.req_no || null,
          updated_at: Date.now(),
        })
      }

      for (const s of changedSheetRows) {
        sheets.push({
          id: `${s.floor_id}:${s.category}:${s.entry_date}`,
          floor_id: s.floor_id,
          category: s.category,
          entry_date: s.entry_date,
          req_no: s.req_no || null,
          status: s.status || 'draft',
          updated_at: Date.now(),
        })
      }

      // Step E: BNR records within the window
      const bnrRows = await fetchAllRowsPaginated(() =>
        admin
          .from('needle_bnr_records')
          .select('needle_item_id, record_date, floor_id, category, quantity')
          .in('floor_id', targetFloorIds)
          .eq('category', cat)
          .gte('record_date', windowStartDate)
          .lte('record_date', windowEndDate)
      )

      const bnrMap = new Map<string, number>()
      for (const b of bnrRows) {
        bnrMap.set(`${b.floor_id}:${b.category}:${b.record_date}:${b.needle_item_id}`, Number(b.quantity) || 0)
      }

      // Step F: Build Authoritative Daily Stock Snapshots
      let datesToSnapshot: string[] = []
      if (!params?.since) {
        // Full initial sync: all dates in [windowStartDate, windowEndDate]
        datesToSnapshot = getDatesInRange(windowStartDate, windowEndDate)
      } else {
        // Incremental sync: check if any transactions or sheets were updated since `since`
        const changedDates: string[] = []
        for (const tx of changedTxRows) {
          changedDates.push(tx.transaction_date)
        }
        for (const s of changedSheetRows) {
          changedDates.push(s.entry_date)
        }

        if (changedDates.length > 0) {
          changedDates.sort()
          const earliestDate = changedDates[0] >= windowStartDate ? changedDates[0] : windowStartDate
          const maxDate = changedDates[changedDates.length - 1]
          const relevantEnd = windowEndDate > maxDate ? windowEndDate : maxDate
          datesToSnapshot = getDatesInRange(earliestDate, relevantEnd)
        } else {
          // If no transactions/sheets changed in the past, only sync windowEndDate
          datesToSnapshot = [windowEndDate]
        }
      }

      // Index all transactions for this category by `${floor_id}:${needle_item_id}:${transaction_date}`
      const txByDateMap = new Map<string, any[]>()
      for (const tx of allTxInWindow) {
        const k = `${tx.floor_id}:${tx.needle_item_id}:${tx.transaction_date}`
        if (!txByDateMap.has(k)) txByDateMap.set(k, [])
        txByDateMap.get(k)!.push(tx)
      }

      // Index sheet headers by `${floor_id}:${entry_date}`
      const sheetByDateMap = new Map<string, string>()
      for (const s of allSheetsInWindow) {
        if (s.req_no) {
          sheetByDateMap.set(`${s.floor_id}:${s.entry_date}`, s.req_no)
        }
      }

      // If datesToSnapshot is not empty, compute authoritative snapshots
      if (datesToSnapshot.length > 0) {
        const snapshotStartDate = datesToSnapshot[0]

        // Calculate starting balance for each needle prior to snapshotStartDate
        // balanceMap contains balances < windowStartDate
        // If snapshotStartDate > windowStartDate, add intermediate transactions from allTxInWindow
        const startBalanceMap = new Map<string, number>()
        for (const floorId of targetFloorIds) {
          const assignedIds = floorAssignedMap.get(floorId) || []
          for (const needleId of assignedIds) {
            const key = `${floorId}:${needleId}`
            let bal = balanceMap.get(key) || 0

            if (snapshotStartDate > windowStartDate) {
              for (const tx of allTxInWindow) {
                if (
                  tx.floor_id === floorId &&
                  tx.needle_item_id === needleId &&
                  tx.transaction_date >= windowStartDate &&
                  tx.transaction_date < snapshotStartDate
                ) {
                  const qty = Number(tx.quantity) || 0
                  if (['OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(tx.transaction_type)) bal += qty
                  if (['ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'].includes(tx.transaction_type)) bal -= qty
                }
              }
            }
            startBalanceMap.set(key, bal)
          }
        }

        for (const floorId of targetFloorIds) {
          const assignedIds = floorAssignedMap.get(floorId) || []
          for (const needleId of assignedIds) {
            let runningBalance = startBalanceMap.get(`${floorId}:${needleId}`) || 0

            for (const d of datesToSnapshot) {
              const dayTxs = txByDateMap.get(`${floorId}:${needleId}:${d}`) || []
              let rcvd = 0
              let dvld = 0
              let trfIn = 0
              let trfOut = 0
              let adjIn = 0
              let adjOut = 0
              let reqNo: string | null = null
              let note: string | null = null

              for (const tx of dayTxs) {
                const qty = Number(tx.quantity) || 0
                if (tx.req_no) reqNo = tx.req_no
                if (tx.notes) note = tx.notes

                switch (tx.transaction_type) {
                  case 'RECEIVE':
                    rcvd += qty
                    break
                  case 'ISSUE':
                    dvld += qty
                    break
                  case 'TRANSFER_IN':
                    trfIn += qty
                    break
                  case 'TRANSFER_OUT':
                    trfOut += qty
                    break
                  case 'ADJUSTMENT_IN':
                    adjIn += qty
                    break
                  case 'ADJUSTMENT_OUT':
                    adjOut += qty
                    break
                }
              }

              if (!reqNo) {
                reqNo = sheetByDateMap.get(`${floorId}:${d}`) || null
              }

              const previous = runningBalance
              const delta = rcvd + trfIn + adjIn - dvld - trfOut - adjOut
              const present = previous + delta
              const bnr = bnrMap.get(`${floorId}:${cat}:${d}:${needleId}`) || 0

              snapshots.push({
                id: `${floorId}:${cat}:${d}:${needleId}`,
                date: d,
                floor_id: floorId,
                category: cat,
                needle_item_id: needleId,
                previous,
                received: rcvd,
                delivery: dvld,
                transfer_in: trfIn,
                transfer_out: trfOut,
                adjustment_in: adjIn,
                adjustment_out: adjOut,
                present,
                bnr,
                req_no: reqNo,
                last_transfer_note: note,
                server_updated_at: Date.now(),
                sync_batch_id: syncBatchId,
              })

              runningBalance = present
            }
          }
        }
      }
    }

    return {
      success: true,
      data: {
        userId: actor.profile.id,
        syncBatchId,
        windowStartDate,
        windowEndDate,
        targetFloorIds,
        categories: targetCategories,
        snapshots,
        baselines,
        movements,
        sheets,
        assignedNeedleCounts,
        syncedAt: Date.now(),
        isIncremental: !!params?.since,
      },
    }
  } catch (err: any) {
    console.error('[getOfflineStockHistorySyncAction] error:', err)
    return { success: false, error: err.message || 'Failed to sync offline stock history.' }
  }
}
