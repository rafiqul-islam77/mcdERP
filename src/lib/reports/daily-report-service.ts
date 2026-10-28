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

/**
 * Fetch Document No and Version No from system_settings with robust fallback
 */
export async function getSystemReportSettings(): Promise<{ documentNo: string; versionNo: string }> {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['daily_report.document_no', 'daily_report.version_no'])

    if (error || !data) {
      return { documentNo: 'QA/03/310', versionNo: '01/2026' }
    }

    let documentNo = 'QA/03/310'
    let versionNo = '01/2026'

    for (const s of data) {
      if (s.setting_key === 'daily_report.document_no' && s.setting_value) {
        documentNo = s.setting_value
      } else if (s.setting_key === 'daily_report.version_no' && s.setting_value) {
        versionNo = s.setting_value
      }
    }

    return { documentNo, versionNo }
  } catch {
    return { documentNo: 'QA/03/310', versionNo: '01/2026' }
  }
}

/**
 * Authoritative Report Data Service for Phase 3.
 * CRITICAL RULE: Consumes authoritative data from getDailyEntrySheetAction.
 * Never performs separate PREV/PRESENT calculation.
 */
export async function getDailyReportData(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
}): Promise<ActionResult<DailyReportData>> {
  const actor = await requireActiveAccount()
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

  // 5. Fetch System Settings (Document No & Version No)
  const { documentNo, versionNo } = await getSystemReportSettings()

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
