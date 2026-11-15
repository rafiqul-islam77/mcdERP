import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import {
  fetchAllRowsPaginated,
  getAllCategorySettings,
  formatFloorDisplayName,
} from './daily-report-service'
import type {
  ActionResult,
  DailyEntryCategory,
  MonthlyReportData,
  MonthlyReportRowItem,
} from '@/types'

export { formatFloorDisplayName }

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export interface MonthBoundaries {
  year: number
  month: number // 1-12
  monthString: string // "YYYY-MM"
  monthStart: string // "YYYY-MM-01"
  monthEnd: string // "YYYY-MM-DD"
  monthLabel: string // "October 2026"
}

/**
 * Calculate precise calendar boundaries for a given month and year.
 * Handles February leap years (28/29 days) and 30/31 day months without timezone shifts.
 */
export function getMonthBoundaries(
  monthParam: string | { year: number; month: number }
): MonthBoundaries {
  let year: number
  let month: number

  if (typeof monthParam === 'string') {
    const parts = monthParam.trim().split('-')
    year = parseInt(parts[0], 10)
    month = parseInt(parts[1], 10)
  } else {
    year = monthParam.year
    month = monthParam.month
  }

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    const now = new Date()
    year = now.getFullYear()
    month = now.getMonth() + 1
  }

  const monthStr = String(month).padStart(2, '0')
  const monthStart = `${year}-${monthStr}-01`
  // Date(year, month, 0) gives the last calendar day of `month` (since JS months are 0-indexed)
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  return {
    year,
    month,
    monthString: `${year}-${monthStr}`,
    monthStart,
    monthEnd,
    monthLabel,
  }
}

/**
 * Fetch authoritative Monthly Report for a single Floor and Category.
 */
export async function getMonthlyReportData(params: {
  month: string | { year: number; month: number }
  floorId: string
  category: DailyEntryCategory
  actor?: any
}): Promise<ActionResult<MonthlyReportData>> {
  const batchRes = await getBatchMonthlyReportData({
    month: params.month,
    floorIds: [params.floorId],
    categories: [params.category],
    actor: params.actor,
  })

  if (!batchRes.success || !batchRes.data) {
    return {
      success: false,
      error: batchRes.error || 'Failed to fetch monthly report data.',
    }
  }

  const report = batchRes.data[0]
  if (!report) {
    return {
      success: false,
      error: 'No report data found for this floor and category.',
    }
  }

  return {
    success: true,
    data: report,
  }
}

/**
 * HIGH-PERFORMANCE BATCH MONTHLY REPORT SERVICE
 * Loads all requested floors and categories in bulk queries, groups in-memory,
 * and calculates authoritative monthly balances without N+1 query loops.
 *
 * Rules:
 * - PREVIOUS: Closing stock balance on last calendar day of previous month (< monthStart)
 * - RECEIVED: Total received during selected month ([monthStart, monthEnd])
 * - DELIVERY: Total delivery/issue during selected month ([monthStart, monthEnd])
 * - PRESENT: Closing balance on final calendar day of selected month (previous + recv + xfer_in - del - xfer_out + adj)
 * - BNR: Total broken needle records during selected month (does not affect balance)
 * - REQ NO and UNIT PRICE: Omitted per Phase 4 specification.
 */
export async function getBatchMonthlyReportData(params: {
  month: string | { year: number; month: number }
  floorIds: string[]
  categories: DailyEntryCategory[]
  actor?: any
}): Promise<ActionResult<MonthlyReportData[]>> {
  if (params.floorIds.length === 0 || params.categories.length === 0) {
    return { success: true, data: [] }
  }

  const boundaries = getMonthBoundaries(params.month)
  const { monthStart, monthLabel, monthString } = boundaries
  let { monthEnd } = boundaries

  // Month-to-date handling: if reporting the current calendar month, clamp cutoff to today
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isOngoingCurrentMonth = today >= monthStart && today <= monthEnd
  if (isOngoingCurrentMonth) {
    monthEnd = today
  }

  let actor = params.actor
  if (!actor) {
    try {
      actor = await requireActiveAccount()
    } catch {
      actor = { profile: { name: 'System Operator' }, isSiteAdmin: true }
    }
  }

  const admin = getAdminClient()

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Load Category Settings ONCE
    // ─────────────────────────────────────────────────────────────────────────
    const categorySettingsMap = await getAllCategorySettings()

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Load Selected Floor Metadata ONCE
    // ─────────────────────────────────────────────────────────────────────────
    const { data: floorRows, error: floorErr } = await admin
      .from('floors')
      .select('id, name, code, active, sort_order, floor_locations(name)')
      .in('id', params.floorIds)
      .order('sort_order', { ascending: true })

    if (floorErr) throw floorErr

    const floorMetaMap = new Map<
      string,
      { floorName: string; floorCode: string | null; locationName: string | null; sortOrder: number }
    >()
    for (const f of floorRows || []) {
      floorMetaMap.set(f.id, {
        floorName: f.name || 'Unknown Floor',
        floorCode: f.code || null,
        locationName: (f.floor_locations as any)?.name || null,
        sortOrder: f.sort_order ?? 0,
      })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Load Master Catalog Items ONCE
    // ─────────────────────────────────────────────────────────────────────────
    const needsNormal = params.categories.includes('NEW') || params.categories.includes('RUNNING')
    const needsIdle = params.categories.includes('IDLE')

    const normalItemsMap = new Map<string, any>()
    if (needsNormal) {
      const nItems = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('normal_needle_items')
          .select('id, item_code, needle_type, size_dia, brand, active')
          .order('id', { ascending: true })
      )

      for (const it of nItems) {
        normalItemsMap.set(it.id, it)
      }
    }

    const idleItemsMap = new Map<string, any>()
    if (needsIdle) {
      const iItems = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('idle_needle_items')
          .select('id, item_code, needle_type, size_dia, brand, active')
          .order('id', { ascending: true })
      )

      for (const it of iItems) {
        idleItemsMap.set(it.id, it)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Batch Floor Assignments
    // ─────────────────────────────────────────────────────────────────────────
    const normalAssignMap = new Map<string, string[]>() // key: `${floor_id}__${category}` -> needle_item_id[]
    if (needsNormal) {
      let nAssign: any[] = []
      try {
        nAssign = await fetchAllRowsPaginated<any>(() =>
          admin
            .from('normal_needle_floor_assignments')
            .select('id, needle_item_id, floor_id, entry_type')
            .in('floor_id', params.floorIds)
            .order('id', { ascending: true })
        )
      } catch (nAssignErr: any) {
        if (nAssignErr.code === '42703' || nAssignErr.message?.includes('entry_type')) {
          const fb = await fetchAllRowsPaginated<any>(() =>
            admin
              .from('normal_needle_floor_assignments')
              .select('id, needle_item_id, floor_id')
              .in('floor_id', params.floorIds)
              .order('id', { ascending: true })
          )
          nAssign = [
            ...fb.map((a: any) => ({ ...a, entry_type: 'new' })),
            ...fb.map((a: any) => ({ ...a, entry_type: 'running' })),
          ]
        } else {
          throw nAssignErr
        }
      }

      for (const a of nAssign) {
        const entryType = (a.entry_type || '').toUpperCase()
        if (entryType === 'NEW') {
          const key = `${a.floor_id}__NEW`
          const list = normalAssignMap.get(key) || []
          list.push(a.needle_item_id)
          normalAssignMap.set(key, list)
        } else if (entryType === 'RUNNING') {
          const key = `${a.floor_id}__RUNNING`
          const list = normalAssignMap.get(key) || []
          list.push(a.needle_item_id)
          normalAssignMap.set(key, list)
        } else {
          // If unassigned or legacy, available to both
          const kNew = `${a.floor_id}__NEW`
          const lNew = normalAssignMap.get(kNew) || []
          lNew.push(a.needle_item_id)
          normalAssignMap.set(kNew, lNew)

          const kRun = `${a.floor_id}__RUNNING`
          const lRun = normalAssignMap.get(kRun) || []
          lRun.push(a.needle_item_id)
          normalAssignMap.set(kRun, lRun)
        }
      }
    }

    const idleAssignMap = new Map<string, string[]>() // key: `${floor_id}__IDLE` -> needle_item_id[]
    if (needsIdle) {
      const iAssign = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('idle_needle_floor_assignments')
          .select('floor_id, needle_item_id')
          .in('floor_id', params.floorIds)
          .order('id', { ascending: true })
      )

      for (const a of iAssign) {
        const key = `${a.floor_id}__IDLE`
        const list = idleAssignMap.get(key) || []
        list.push(a.needle_item_id)
        idleAssignMap.set(key, list)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Batch Transactions (Physical Separation: NEW vs RUNNING vs IDLE)
    // Query all transactions up to monthEnd to calculate both:
    // 1) Historical transactions (< monthStart) for Previous Balance
    // 2) Current month transactions (>= monthStart && <= monthEnd) for Movements
    // ─────────────────────────────────────────────────────────────────────────
    const txMap = new Map<string, any[]>() // key: `${floor_id}__${category}__${needle_item_id}`

    if (params.categories.includes('NEW')) {
      const newTxRows = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('needle_new_transactions')
          .select('id, needle_item_id, floor_id, transaction_date, transaction_type, quantity, notes')
          .in('floor_id', params.floorIds)
          .lte('transaction_date', monthEnd)
          .order('id', { ascending: true })
      )

      for (const tx of newTxRows) {
        const key = `${tx.floor_id}__NEW__${tx.needle_item_id}`
        const list = txMap.get(key) || []
        list.push(tx)
        txMap.set(key, list)
      }
    }

    if (params.categories.includes('RUNNING')) {
      const runTxRows = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('needle_running_transactions')
          .select('id, needle_item_id, floor_id, transaction_date, transaction_type, quantity, notes')
          .in('floor_id', params.floorIds)
          .lte('transaction_date', monthEnd)
          .order('id', { ascending: true })
      )

      for (const tx of runTxRows) {
        const key = `${tx.floor_id}__RUNNING__${tx.needle_item_id}`
        const list = txMap.get(key) || []
        list.push(tx)
        txMap.set(key, list)
      }
    }

    if (params.categories.includes('IDLE')) {
      const idleTxRows = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('needle_idle_transactions')
          .select('id, needle_item_id, floor_id, transaction_date, transaction_type, quantity, notes')
          .in('floor_id', params.floorIds)
          .lte('transaction_date', monthEnd)
          .order('id', { ascending: true })
      )

      for (const tx of idleTxRows) {
        const key = `${tx.floor_id}__IDLE__${tx.needle_item_id}`
        const list = txMap.get(key) || []
        list.push(tx)
        txMap.set(key, list)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Batch BNR Records (Summed within selected month range)
    // ─────────────────────────────────────────────────────────────────────────
    const bnrMap = new Map<string, number>() // key: `${floor_id}__${category}__${needle_item_id}`
    try {
      const bnrRows = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('needle_bnr_records')
          .select('id, needle_item_id, floor_id, category, quantity')
          .gte('record_date', monthStart)
          .lte('record_date', monthEnd)
          .in('floor_id', params.floorIds)
          .in('category', params.categories)
          .order('id', { ascending: true })
      )

      for (const b of bnrRows) {
        const cat = (b.category || '').toUpperCase()
        const key = `${b.floor_id}__${cat}__${b.needle_item_id}`
        const cur = bnrMap.get(key) || 0
        bnrMap.set(key, cur + (Number(b.quantity) || 0))
      }
    } catch (bnrErr: any) {
      if (bnrErr?.code === '42P01' || bnrErr?.code === 'PGRST205' || bnrErr?.message?.includes('does not exist')) {
        // Missing table fallback: treat as 0 BNR
      } else {
        throw bnrErr
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: In-Memory Assembly & Exact Stock Balance Calculation
    // ─────────────────────────────────────────────────────────────────────────
    // Preserve requested floor order
    const sortedFloorIds = [...params.floorIds].sort((a, b) => {
      const orderA = floorMetaMap.get(a)?.sortOrder ?? 0
      const orderB = floorMetaMap.get(b)?.sortOrder ?? 0
      return orderA - orderB
    })

    const reports: MonthlyReportData[] = []

    for (const floorId of sortedFloorIds) {
      const floorMeta = floorMetaMap.get(floorId) || {
        floorName: 'Unknown Floor',
        floorCode: null,
        locationName: null,
        sortOrder: 0,
      }

      for (const category of params.categories) {
        const catSettings = categorySettingsMap.get(category) || {
          documentNo: 'QA/03/310',
          versionNo: '01/2026',
        }

        const operatorName = actor.profile?.name || 'System Operator'

        // Assigned items (deduplicated)
        const rawAssignedIds =
          category === 'IDLE'
            ? idleAssignMap.get(`${floorId}__IDLE`) || []
            : normalAssignMap.get(`${floorId}__${category}`) || []
        const assignedIds = Array.from(new Set(rawAssignedIds))

        const assignedItems = assignedIds
          .map((id) => (category === 'IDLE' ? idleItemsMap.get(id) : normalItemsMap.get(id)))
          .filter(Boolean)
          .sort((a, b) => (a.item_code || '').localeCompare(b.item_code || ''))

        let totalPrevious = 0
        let totalReceived = 0
        let totalDelivery = 0
        let totalPresent = 0
        let totalBnr = 0

        const rows: MonthlyReportRowItem[] = assignedItems.map((item, idx) => {
          const itemTx = txMap.get(`${floorId}__${category}__${item.id}`) || []

          let previous = 0
          let received = 0
          let delivery = 0
          let transfer_in = 0
          let transfer_out = 0
          let adjustment = 0
          let last_transfer_note: string | null = null

          for (const tx of itemTx) {
            const qty = Number(tx.quantity) || 0
            const isPrior = tx.transaction_date < monthStart
            const isWithinReportingPeriod =
              tx.transaction_date >= monthStart && tx.transaction_date <= monthEnd

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
            } else if (isWithinReportingPeriod) {
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
          const bnr = bnrMap.get(`${floorId}__${category}__${item.id}`) || 0

          totalPrevious += previous
          totalReceived += received
          totalDelivery += delivery
          totalPresent += present
          totalBnr += bnr

          let note: string | null = null
          if (last_transfer_note) {
            note = last_transfer_note
          } else if (transfer_in > 0) {
            note = `Transfer In: +${transfer_in}`
          } else if (transfer_out > 0) {
            note = `Transfer Out: -${transfer_out}`
          }

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
            transfer_in,
            transfer_out,
            adjustment_in: 0,
            adjustment_out: 0,
            last_transfer_note,
            server_updated_at: Date.now(),
            sync_batch_id: '',
            sl: idx + 1,
            custom: null,
            note,
          }
        })

        // Source note
        let sourceNote = isOngoingCurrentMonth
          ? `✅ Month-to-date: ${monthLabel} (1–${parseInt(monthEnd.slice(8, 10), 10)})`
          : `✅ Actual data: ${monthLabel}`

        const hasTransactions = rows.some(
          (r) =>
            r.received > 0 ||
            r.delivery > 0 ||
            r.bnr > 0 ||
            (r.transfer_in ?? 0) > 0 ||
            (r.transfer_out ?? 0) > 0
        )
        if (!hasTransactions && rows.some((r) => r.previous > 0)) {
          sourceNote = isOngoingCurrentMonth
            ? `⏪ Carry (Month-to-date): ${monthLabel}`
            : `⏪ Carry: ${monthLabel}`
        } else if (!hasTransactions && rows.length === 0) {
          sourceNote = `ℹ️ No needle items assigned: ${monthLabel}`
        }

        reports.push({
          month: monthString,
          monthLabel,
          floorId,
          floorName: floorMeta.floorName,
          floorCode: floorMeta.floorCode,
          locationName: floorMeta.locationName,
          category,
          operatorName,
          sourceNote,
          rows,
          documentNo: catSettings.documentNo,
          versionNo: catSettings.versionNo,
          summary: {
            totalPrevious,
            totalReceived,
            totalDelivery,
            totalPresent,
            totalBnr,
          },
        })
      }
    }

    return {
      success: true,
      data: reports,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to generate batch monthly report data.',
    }
  }
}
