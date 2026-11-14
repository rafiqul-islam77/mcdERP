import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { getDailyEntrySheetAction } from '@/app/actions/daily-entry'
import type {
  ActionResult,
  DailyEntryCategory,
  DailyReportData,
  DailyReportRowItem,
} from '@/types'
import normalSeed from '@/lib/data/normal-needle-seed.json'
import idleSeed from '@/lib/data/idle-needle-seed.json'

// Fallback seed maps for unit prices
const normalPriceMap = new Map<string, number | null>()
for (const item of normalSeed as any[]) {
  normalPriceMap.set(item.item_code, item.unit_price_usd ?? null)
}

const idlePriceMap = new Map<string, number | null>()
for (const item of idleSeed as any[]) {
  idlePriceMap.set(item.item_code, item.unit_price_usd ?? null)
}

export { formatFloorDisplayName } from './report-utils'

/**
 * Fetch Document No and Version No for all categories in a SINGLE system_settings query
 */
export async function getAllCategorySettings(): Promise<
  Map<DailyEntryCategory, { documentNo: string; versionNo: string }>
> {
  const categories: DailyEntryCategory[] = ['RUNNING', 'NEW', 'IDLE']
  const keys = [
    'daily_report.running.document_no',
    'daily_report.running.version_no',
    'daily_report.new.document_no',
    'daily_report.new.version_no',
    'daily_report.idle.document_no',
    'daily_report.idle.version_no',
    'daily_report.document_no',
    'daily_report.version_no',
  ]

  const settingsMap = new Map<DailyEntryCategory, { documentNo: string; versionNo: string }>()
  for (const cat of categories) {
    settingsMap.set(cat, { documentNo: 'QA/03/310', versionNo: '01/2026' })
  }

  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', keys)

    if (error || !data) {
      return settingsMap
    }

    const valMap = new Map<string, string>()
    for (const s of data) {
      if (s.setting_value) {
        valMap.set(s.setting_key, s.setting_value)
      }
    }

    for (const cat of categories) {
      const catKey = cat.toLowerCase()
      const docKey = `daily_report.${catKey}.document_no`
      const verKey = `daily_report.${catKey}.version_no`
      const documentNo = valMap.get(docKey) || valMap.get('daily_report.document_no') || 'QA/03/310'
      const versionNo = valMap.get(verKey) || valMap.get('daily_report.version_no') || '01/2026'
      settingsMap.set(cat, { documentNo, versionNo })
    }

    return settingsMap
  } catch {
    return settingsMap
  }
}

/**
 * Fetch Document No and Version No for a specific category from system_settings with robust fallback
 */
export async function getSystemReportSettings(
  category: DailyEntryCategory = 'RUNNING'
): Promise<{ documentNo: string; versionNo: string }> {
  const catKey = (category || 'RUNNING').toLowerCase()
  const docKey = `daily_report.${catKey}.document_no`
  const verKey = `daily_report.${catKey}.version_no`

  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [docKey, verKey, 'daily_report.document_no', 'daily_report.version_no'])

    if (error || !data) {
      return { documentNo: 'QA/03/310', versionNo: '01/2026' }
    }

    const map = new Map<string, string>()
    for (const s of data) {
      if (s.setting_value) {
        map.set(s.setting_key, s.setting_value)
      }
    }

    // 1. Category-specific setting
    // 2. Legacy general setting
    // 3. Fallback default
    const documentNo = map.get(docKey) || map.get('daily_report.document_no') || 'QA/03/310'
    const versionNo = map.get(verKey) || map.get('daily_report.version_no') || '01/2026'

    return { documentNo, versionNo }
  } catch {
    return { documentNo: 'QA/03/310', versionNo: '01/2026' }
  }
}

/**
 * Authoritative Report Data Service for Phase 3 (Single floor).
 * CRITICAL RULE: Consumes authoritative data from getDailyEntrySheetAction.
 * Never performs separate PREV/PRESENT calculation.
 */
export async function getDailyReportData(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
  actor?: any
}): Promise<ActionResult<DailyReportData>> {
  let actor = params.actor
  if (!actor) {
    try {
      actor = await requireActiveAccount()
    } catch {
      actor = { profile: { name: 'System Operator' }, isSiteAdmin: true }
    }
  }
  const admin = getAdminClient()

  // 1. Authoritative Daily Entry Sheet Rows & Balances
  const sheetResult = await getDailyEntrySheetAction({
    date: params.date,
    floorId: params.floorId,
    category: params.category,
  })

  if (!sheetResult.success || !sheetResult.data) {
    return {
      success: false,
      error: sheetResult.error || 'Failed to fetch authoritative daily entry data.',
    }
  }

  const { rows: entryRows, sheetId, sheetStatus, requisitionNo } = sheetResult.data

  // 2. Fetch Floor details
  let floorName = 'Unknown Floor'
  let floorCode: string | null = null
  let locationName: string | null = null

  try {
    const { data: floorData } = await admin
      .from('floors')
      .select('id, name, code, floor_locations(name)')
      .eq('id', params.floorId)
      .maybeSingle()

    if (floorData) {
      floorName = floorData.name
      floorCode = floorData.code
      locationName = (floorData.floor_locations as any)?.name || null
    }
  } catch {
    // Non-critical: keep defaults
  }

  // 3. Fetch operator name and source information
  let operatorName: string | null = null
  let sourceNote = `✅ Actual data: ${params.date}`

  if (sheetId) {
    try {
      const { data: sheetInfo } = await admin
        .from('needle_daily_sheets')
        .select('created_by, updated_by, created_at, profiles!needle_daily_sheets_created_by_fkey(name)')
        .eq('id', sheetId)
        .maybeSingle()

      if (sheetInfo) {
        operatorName = (sheetInfo.profiles as any)?.name || null
      }
    } catch {
      // Fallback: check profile of current actor
    }
  }

  if (!operatorName) {
    operatorName = actor.profile.name || 'System Operator'
  }

  // Check if any transaction exists for this date
  const hasTransactions = entryRows.some((r) => r.received > 0 || r.delivery > 0 || r.bnr > 0 || r.transfer_in > 0 || r.transfer_out > 0)
  if (!hasTransactions && entryRows.some((r) => r.previous > 0)) {
    sourceNote = `⏪ Carry: ${params.date}`
  }

  // 4. Fetch unit prices from Master Catalog
  const masterTable = params.category === 'IDLE' ? 'idle_needle_items' : 'normal_needle_items'
  const needleIds = entryRows.map((r) => r.needle_item_id)
  const priceMap = new Map<string, number | null>()

  if (needleIds.length > 0) {
    try {
      const { data: masterItems } = await admin
        .from(masterTable)
        .select('id, item_code, unit_price_usd')
        .in('id', needleIds)

      if (masterItems) {
        for (const item of masterItems) {
          priceMap.set(item.id, item.unit_price_usd !== null ? Number(item.unit_price_usd) : null)
        }
      }
    } catch {
      // Fallback to seed maps
    }
  }

  // 5. Fetch System Settings (Category-specific Document No & Version No)
  const { documentNo, versionNo } = await getSystemReportSettings(params.category)

  // 6. Enrich Rows for Present Balance Report
  let totalPrevious = 0
  let totalReceived = 0
  let totalDelivery = 0
  let totalPresent = 0
  let totalBnr = 0

  const rows: DailyReportRowItem[] = entryRows.map((entry, idx) => {
    let unitPriceUsd = priceMap.get(entry.needle_item_id)
    if (unitPriceUsd === undefined || unitPriceUsd === null) {
      if (params.category === 'IDLE') {
        unitPriceUsd = idlePriceMap.get(entry.item_code) ?? null
      } else {
        unitPriceUsd = normalPriceMap.get(entry.item_code) ?? null
      }
    }

    totalPrevious += entry.previous
    totalReceived += entry.received
    totalDelivery += entry.delivery
    totalPresent += entry.present
    totalBnr += entry.bnr

    let note: string | null = null
    if (entry.last_transfer_note) {
      note = entry.last_transfer_note
    } else if (entry.transfer_in > 0) {
      note = `Transfer In: +${entry.transfer_in}`
    } else if (entry.transfer_out > 0) {
      note = `Transfer Out: -${entry.transfer_out}`
    }

    return {
      ...entry,
      sl: idx + 1,
      unit_price_usd: unitPriceUsd,
      custom: null,
      note,
    }
  })

  return {
    success: true,
    data: {
      date: params.date,
      floorId: params.floorId,
      floorName,
      floorCode,
      locationName,
      category: params.category,
      operatorName,
      sourceNote,
      requisitionNo,
      sheetStatus,
      rows,
      documentNo,
      versionNo,
      summary: {
        totalPrevious,
        totalReceived,
        totalDelivery,
        totalPresent,
        totalBnr,
      },
    },
  }
}

/**
 * Generic helper to fetch all rows using Supabase range pagination.
 * Ensures queries returning >1000 rows (PostgREST max_rows default) are not truncated.
 * pageSize defaults to 500 records.
 */
export async function fetchAllRowsPaginated<T>(
  buildQuery: () => any,
  pageSize = 500
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await buildQuery().range(from, to)
    if (error) {
      throw error
    }
    if (!data || data.length === 0) {
      break
    }
    allRows.push(...data)
    if (data.length < pageSize) {
      break
    }
    from += pageSize
  }

  return allRows
}

/**
 * HIGH-PERFORMANCE BATCH REPORT SERVICE (Steps 1 + 2 + 3)
 * Fetches all requested floors and categories in bulk queries, groups in-memory,
 * and calculates identical stock balances without repeated N+1 DB loops.
 */
export async function getBatchDailyReportData(params: {
  date: string
  floorIds: string[]
  categories: DailyEntryCategory[]
  actor?: any
}): Promise<ActionResult<DailyReportData[]>> {
  if (params.floorIds.length === 0 || params.categories.length === 0) {
    return { success: true, data: [] }
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
    // STEP 2A: Load Category Settings ONCE
    // ─────────────────────────────────────────────────────────────────────────
    const categorySettingsMap = await getAllCategorySettings()

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2B: Load Selected Floor Metadata ONCE
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
    // STEP 2C: Load Master Items and Unit Prices ONCE
    // ─────────────────────────────────────────────────────────────────────────
    const needsNormal = params.categories.includes('NEW') || params.categories.includes('RUNNING')
    const needsIdle = params.categories.includes('IDLE')

    const normalItemsMap = new Map<string, any>()
    if (needsNormal) {
      const nItems = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('normal_needle_items')
          .select('id, item_code, needle_type, size_dia, brand, unit_price_usd, active')
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
          .select('id, item_code, needle_type, size_dia, brand, unit_price_usd, active')
          .order('id', { ascending: true })
      )

      for (const it of iItems) {
        idleItemsMap.set(it.id, it)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3A: Batch Floor Assignments
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
          .select('id, needle_item_id, floor_id')
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
    // STEP 3B: Batch Daily Sheet Headers & Operator Profiles
    // ─────────────────────────────────────────────────────────────────────────
    const sheetRows = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_daily_sheets')
        .select('id, floor_id, category, status, entry_date, created_by, profiles!needle_daily_sheets_created_by_fkey(name)')
        .eq('entry_date', params.date)
        .in('floor_id', params.floorIds)
        .in('category', params.categories)
        .order('id', { ascending: true })
    )

    const sheetMap = new Map<
      string,
      { id: string; status: 'draft' | 'posted' | 'closed'; req_no?: string | null; operatorName: string | null }
    >()
    for (const s of sheetRows) {
      const cat = (s.category || '').toUpperCase()
      const key = `${s.floor_id}__${cat}`
      sheetMap.set(key, {
        id: s.id,
        status: s.status || 'draft',
        req_no: null,
        operatorName: (s.profiles as any)?.name || null,
      })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3C: Batch Transactions (Physical Separation: NEW vs RUNNING vs IDLE)
    // ─────────────────────────────────────────────────────────────────────────
    const txMap = new Map<string, any[]>() // key: `${floor_id}__${category}__${needle_item_id}`

    if (params.categories.includes('NEW')) {
      const newTxRows = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('needle_new_transactions')
          .select('id, needle_item_id, floor_id, transaction_date, transaction_type, quantity, req_no, notes')
          .in('floor_id', params.floorIds)
          .lte('transaction_date', params.date)
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
          .select('id, needle_item_id, floor_id, transaction_date, transaction_type, quantity, req_no, notes')
          .in('floor_id', params.floorIds)
          .lte('transaction_date', params.date)
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
          .select('id, needle_item_id, floor_id, transaction_date, transaction_type, quantity, req_no, notes')
          .in('floor_id', params.floorIds)
          .lte('transaction_date', params.date)
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
    // STEP 3D: Batch BNR Records
    // ─────────────────────────────────────────────────────────────────────────
    const bnrMap = new Map<string, number>() // key: `${floor_id}__${category}__${needle_item_id}`
    try {
      const bnrRows = await fetchAllRowsPaginated<any>(() =>
        admin
          .from('needle_bnr_records')
          .select('id, needle_item_id, floor_id, category, quantity')
          .eq('record_date', params.date)
          .in('floor_id', params.floorIds)
          .in('category', params.categories)
          .order('id', { ascending: true })
      )

      for (const b of bnrRows) {
        const cat = (b.category || '').toUpperCase()
        const key = `${b.floor_id}__${cat}__${b.needle_item_id}`
        bnrMap.set(key, Number(b.quantity) || 0)
      }
    } catch (bnrErr: any) {
      if (bnrErr?.code === '42P01' || bnrErr?.code === 'PGRST205' || bnrErr?.message?.includes('does not exist')) {
        // Missing table fallback: treat as 0 BNR
      } else {
        throw bnrErr
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3E: In-Memory Assembly & Exact Stock Balance Calculation
    // ─────────────────────────────────────────────────────────────────────────
    // Preserve requested floor order (or sort_order)
    const sortedFloorIds = [...params.floorIds].sort((a, b) => {
      const orderA = floorMetaMap.get(a)?.sortOrder ?? 0
      const orderB = floorMetaMap.get(b)?.sortOrder ?? 0
      return orderA - orderB
    })

    const reports: DailyReportData[] = []

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

        const sheetKey = `${floorId}__${category}`
        const sheetInfo = sheetMap.get(sheetKey)
                const sheetStatus = sheetInfo?.status || 'draft'
        const operatorName = sheetInfo?.operatorName || actor.profile.name || 'System Operator'

        // Assigned items
        const assignedIds =
          category === 'IDLE'
            ? idleAssignMap.get(`${floorId}__IDLE`) || []
            : normalAssignMap.get(`${floorId}__${category}`) || []

        const assignedItems = assignedIds
          .map((id) => (category === 'IDLE' ? idleItemsMap.get(id) : normalItemsMap.get(id)))
          .filter(Boolean)
          .sort((a, b) => (a.item_code || '').localeCompare(b.item_code || ''))

        // Check sheet requisition number
        let sheetReqNo: string | null = sheetInfo?.req_no || null
        if (!sheetReqNo) {
          for (const item of assignedItems) {
            const itemTx = txMap.get(`${floorId}__${category}__${item.id}`) || []
            const curReceive = itemTx.find(
              (t: any) => t.transaction_date === params.date && t.transaction_type === 'RECEIVE' && t.req_no
            )
            if (curReceive?.req_no) {
              sheetReqNo = curReceive.req_no
              break
            }
          }
        }

        // Exact Stock Balance Calculation per Item (100% parity with getDailyEntrySheetAction)
        let totalPrevious = 0
        let totalReceived = 0
        let totalDelivery = 0
        let totalPresent = 0
        let totalBnr = 0

        const rows: DailyReportRowItem[] = assignedItems.map((item, idx) => {
          const itemTx = txMap.get(`${floorId}__${category}__${item.id}`) || []

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
          const bnr = bnrMap.get(`${floorId}__${category}__${item.id}`) || 0

          // Apply sheet req_no if row received > 0 and missing req_no
          if (!req_no && sheetReqNo && received > 0) {
            req_no = sheetReqNo
          }

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

          let unitPriceUsd: number | null =
            item.unit_price_usd !== null && item.unit_price_usd !== undefined
              ? Number(item.unit_price_usd)
              : null

          if (unitPriceUsd === null) {
            if (category === 'IDLE') {
              unitPriceUsd = idlePriceMap.get(item.item_code) ?? null
            } else {
              unitPriceUsd = normalPriceMap.get(item.item_code) ?? null
            }
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
            req_no,
            transfer_in,
            transfer_out,
            last_transfer_note,
            sl: idx + 1,
            unit_price_usd: unitPriceUsd,
            custom: null,
            note,
          }
        })

        // Source note calculation
        let sourceNote = `✅ Actual data: ${params.date}`
        const hasTransactions = rows.some(
          (r) => r.received > 0 || r.delivery > 0 || r.bnr > 0 || (r.transfer_in ?? 0) > 0 || (r.transfer_out ?? 0) > 0
        )
        if (!hasTransactions && rows.some((r) => r.previous > 0)) {
          sourceNote = `⏪ Carry: ${params.date}`
        }

        reports.push({
          date: params.date,
          floorId,
          floorName: floorMeta.floorName,
          floorCode: floorMeta.floorCode,
          locationName: floorMeta.locationName,
          category,
          operatorName,
          sourceNote,
          requisitionNo: sheetReqNo,
          sheetStatus,
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

    return { success: true, data: reports }
  } catch (err: any) {
    console.error('[getBatchDailyReportData] error:', err)
    return { success: false, error: err.message || 'Failed to batch generate report data.' }
  }
}
