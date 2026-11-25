import { getAdminClient } from '@/lib/supabase/admin'
import {
  getBatchDailyReportData,
  fetchAllRowsPaginated,
} from '@/lib/reports/daily-report-service'
import {
  getBatchMonthlyReportData,
  getMonthBoundaries,
} from '@/lib/reports/monthly-report-service'
import type {
  DailyEntryCategory,
  DailyReportData,
  MonthlyReportData,
  Floor,
  CurrentUser,
} from '@/types'
import type {
  DashboardData,
  DashboardFilters,
  MonthlyClosingStockPoint,
} from './dashboard-types'
import {
  aggregateCategoryFloorActivity,
  aggregateCategoryFloorStock,
  calculateIdleFloorDistribution,
  calculateIdleKPIs,
  calculateNormalKPIs,
  calculateNormalStockDistribution,
  combineNormalFloorActivity,
  combineNormalFloorStock,
  extractNonMovingItems,
} from './dashboard-aggregations'

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function parseNonNegativeIntSetting(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null
  return parseInt(trimmed, 10)
}

/**
 * Fetches global Dashboard General Information settings (Total Needle Booth & Total Manpower)
 * from public.system_settings. Unset/missing values return null ("Not Available"); "0" returns 0.
 */
export async function getDashboardFacilitySettings(): Promise<{
  needleBoothCount: number | null
  manpowerCount: number | null
}> {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['total_needle_booth', 'total_manpower'])

    if (error || !data) {
      return { needleBoothCount: null, manpowerCount: null }
    }

    const map = new Map<string, string>()
    for (const row of data) {
      map.set(row.setting_key, row.setting_value)
    }

    return {
      needleBoothCount: parseNonNegativeIntSetting(map.get('total_needle_booth')),
      manpowerCount: parseNonNegativeIntSetting(map.get('total_manpower')),
    }
  } catch {
    return { needleBoothCount: null, manpowerCount: null }
  }
}

function createEmptyDashboardData(
  filters: DashboardFilters,
  authorizedFloorIds: string[],
  authorizedCategories: DailyEntryCategory[],
  allAuthorizedFloors: Floor[],
  monthStr: string,
  facilityKpis: { needleBoothCount: number | null; manpowerCount: number | null }
): DashboardData {
  const emptyActivity = (cat: DailyEntryCategory | 'NORMAL') => ({
    category: cat,
    items: [],
    totalReceived: 0,
    totalDelivery: 0,
  })
  const emptyStock = (cat: DailyEntryCategory | 'NORMAL') => ({
    category: cat,
    items: [],
    totalStock: 0,
  })

  return {
    filters,
    facilityKpis,
    normal: {
      kpis: {
        runningStock: 0,
        newStock: 0,
        totalNormalStock: 0,
        todayReceived: 0,
        todayRunningReceived: 0,
        todayNewReceived: 0,
        todayDelivery: 0,
        todayRunningDelivery: 0,
        todayNewDelivery: 0,
        monthlyReceived: 0,
        monthlyRunningReceived: 0,
        monthlyNewReceived: 0,
        monthlyDelivery: 0,
        monthlyRunningDelivery: 0,
        monthlyNewDelivery: 0,
      },
      dailyActivity: {
        RUNNING: emptyActivity('RUNNING'),
        NEW: emptyActivity('NEW'),
        combined: emptyActivity('NORMAL'),
      },
      monthlyActivity: {
        RUNNING: emptyActivity('RUNNING'),
        NEW: emptyActivity('NEW'),
        combined: emptyActivity('NORMAL'),
      },
      floorStock: {
        RUNNING: emptyStock('RUNNING'),
        NEW: emptyStock('NEW'),
        combined: emptyStock('NORMAL'),
      },
      stockDistribution: [],
      nonMovingItems: [],
      nonMovingByFloor: [],
    },
    idle: {
      kpis: {
        totalIdleStock: 0,
        todayReceived: 0,
        todayDelivery: 0,
        monthlyReceived: 0,
        monthlyDelivery: 0,
        activeIdleFloorsCount: 0,
        totalAuthorizedFloorsCount: authorizedFloorIds.length,
      },
      dailyActivity: emptyActivity('IDLE'),
      monthlyActivity: emptyActivity('IDLE'),
      floorStock: emptyStock('IDLE'),
      stockDistributionByFloor: [],
      nonMovingItems: [],
      nonMovingByFloor: [],
    },
    monthlyStockTrend: [],
    authorizedFloorIds,
    authorizedCategories,
    allAuthorizedFloors,
    asOfDate: filters.date,
    asOfMonth: monthStr,
  }
}

/**
 * Coordinated Dashboard Data Service
 *
 * Implements the single coordinated pipeline:
 * 1. Resolves authorized floors and categories for the current actor.
 * 2. Loads ALL authorized categories once (Normal: RUNNING + NEW, Idle: IDLE)
 *    via getBatchDailyReportData() & getBatchMonthlyReportData() (500-row batch pagination).
 *    This allows switching between Normal & Idle tabs without redundant DB queries.
 * 3. Extracts transaction movement dates for separated Normal vs Idle 2-month non-moving items.
 * 4. Computes 12-month closing stock & monthly movement trends from one batch preload.
 * 5. Strictly separates Normal Needle (RUNNING + NEW) from Idle Needle (IDLE only).
 */
export async function getDashboardData(
  filters: DashboardFilters,
  actor: CurrentUser,
  allAuthorizedFloors: Floor[],
  authorizedCategories: DailyEntryCategory[]
): Promise<DashboardData> {
  const admin = getAdminClient()
  const monthStr = `${filters.year}-${String(filters.month).padStart(2, '0')}`
  const facilityKpis = await getDashboardFacilitySettings()

  // 1. Determine target floors (strictly constrained to authorized floors)
  const authorizedFloorIds = allAuthorizedFloors.map((f) => f.id)
  const targetFloorIds =
    filters.floorId !== 'all' && authorizedFloorIds.includes(filters.floorId)
      ? [filters.floorId]
      : authorizedFloorIds

  // 2. Always fetch all authorized categories for the selected date/floor/month
  // so tab switching (Normal <-> Idle) and Normal sub-filtering never trigger DB reloads.
  const targetCategories: DailyEntryCategory[] = [...authorizedCategories]

  if (targetFloorIds.length === 0 || targetCategories.length === 0) {
    return createEmptyDashboardData(
      filters,
      authorizedFloorIds,
      authorizedCategories,
      allAuthorizedFloors,
      monthStr,
      facilityKpis
    )
  }

  // 3. Load authoritative Daily Report Data for selected date
  const dailyRes = await getBatchDailyReportData({
    date: filters.date,
    floorIds: targetFloorIds,
    categories: targetCategories,
    actor,
  })

  if (!dailyRes.success || !dailyRes.data) {
    throw new Error(dailyRes.error || 'Failed to fetch batch daily report data.')
  }
  const dailyReports: DailyReportData[] = dailyRes.data

  // 4. Load authoritative Monthly Report Data for selected month & year
  const monthlyRes = await getBatchMonthlyReportData({
    month: monthStr,
    floorIds: targetFloorIds,
    categories: targetCategories,
    actor,
  })

  if (!monthlyRes.success || !monthlyRes.data) {
    throw new Error(monthlyRes.error || 'Failed to fetch batch monthly report data.')
  }
  const monthlyReports: MonthlyReportData[] = monthlyRes.data

  // 5. Compute 12-Month boundaries & Preload category transactions ONCE
  // Used for BOTH 12-month closing stock / movement trends AND 2-month non-moving detection!
  const monthTargets: {
    year: number
    month: number
    monthString: string
    label: string
    startDate: string
    endDate: string
  }[] = []

  for (let i = 11; i >= 0; i--) {
    let y = filters.year
    let m = filters.month - i
    while (m <= 0) {
      m += 12
      y -= 1
    }
    const boundaries = getMonthBoundaries({ year: y, month: m })
    monthTargets.push({
      year: y,
      month: m,
      monthString: boundaries.monthString,
      label: `${MONTH_SHORT_NAMES[m - 1]} '${String(y).slice(-2)}`,
      startDate: boundaries.monthStart,
      endDate: boundaries.monthEnd,
    })
  }

  const maxTrendDate = monthTargets[monthTargets.length - 1].endDate
  const maxTxCutoff = filters.date > maxTrendDate ? filters.date : maxTrendDate

  const preloadedTransactions: { category: DailyEntryCategory; txs: any[] }[] = []

  if (targetCategories.includes('RUNNING')) {
    const txs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_running_transactions')
        .select('needle_item_id, floor_id, quantity, transaction_type, transaction_date')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', maxTxCutoff)
        .order('id', { ascending: true })
    )
    preloadedTransactions.push({ category: 'RUNNING', txs })
  }

  if (targetCategories.includes('NEW')) {
    const txs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_new_transactions')
        .select('needle_item_id, floor_id, quantity, transaction_type, transaction_date')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', maxTxCutoff)
        .order('id', { ascending: true })
    )
    preloadedTransactions.push({ category: 'NEW', txs })
  }

  if (targetCategories.includes('IDLE')) {
    const txs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_idle_transactions')
        .select('needle_item_id, floor_id, quantity, transaction_type, transaction_date')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', maxTxCutoff)
        .order('id', { ascending: true })
    )
    preloadedTransactions.push({ category: 'IDLE', txs })
  }

  // Build Movement History Map for Non-Moving Items (up to filters.date)
  const itemMovementMap = new Map<
    string,
    { lastDate: string | null; firstDate: string | null }
  >()
  const qualifyingTypes = new Set([
    'RECEIVE',
    'ISSUE',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
  ])

  for (const bucket of preloadedTransactions) {
    for (const tx of bucket.txs) {
      if (tx.transaction_date > filters.date) continue
      const key = `${tx.floor_id}__${bucket.category}__${tx.needle_item_id}`
      const cur = itemMovementMap.get(key) || { lastDate: null, firstDate: null }

      if (!cur.firstDate || tx.transaction_date < cur.firstDate) {
        cur.firstDate = tx.transaction_date
      }
      if (qualifyingTypes.has(tx.transaction_type)) {
        if (!cur.lastDate || tx.transaction_date > cur.lastDate) {
          cur.lastDate = tx.transaction_date
        }
      }
      itemMovementMap.set(key, cur)
    }
  }

  // Build 12-Month Closing Stock & Monthly Movement Trends
  const monthTrendPoints: MonthlyClosingStockPoint[] = []

  for (const target of monthTargets) {
    let runningStock = 0
    let newStock = 0
    let idleStock = 0
    let runningReceived = 0
    let runningDelivery = 0
    let newReceived = 0
    let newDelivery = 0
    let idleReceived = 0
    let idleDelivery = 0

    for (const bucket of preloadedTransactions) {
      let bBalance = 0
      let bReceived = 0
      let bDelivery = 0

      for (const t of bucket.txs) {
        const q = Number(t.quantity) || 0
        if (t.transaction_date <= target.endDate) {
          switch (t.transaction_type) {
            case 'OPENING':
            case 'RECEIVE':
            case 'TRANSFER_IN':
            case 'ADJUSTMENT_IN':
              bBalance += q
              break
            case 'ISSUE':
            case 'TRANSFER_OUT':
            case 'ADJUSTMENT_OUT':
              bBalance -= q
              break
          }
        }
        if (t.transaction_date >= target.startDate && t.transaction_date <= target.endDate) {
          if (t.transaction_type === 'RECEIVE') bReceived += q
          if (t.transaction_type === 'ISSUE') bDelivery += q
        }
      }

      if (bucket.category === 'RUNNING') {
        runningStock = Math.max(0, bBalance)
        runningReceived = bReceived
        runningDelivery = bDelivery
      } else if (bucket.category === 'NEW') {
        newStock = Math.max(0, bBalance)
        newReceived = bReceived
        newDelivery = bDelivery
      } else if (bucket.category === 'IDLE') {
        idleStock = Math.max(0, bBalance)
        idleReceived = bReceived
        idleDelivery = bDelivery
      }
    }

    monthTrendPoints.push({
      monthString: target.monthString,
      monthLabel: target.label,
      runningStock,
      newStock,
      normalTotalStock: runningStock + newStock, // Strictly Normal only
      idleStock,
      runningReceived,
      runningDelivery,
      newReceived,
      newDelivery,
      normalReceived: runningReceived + newReceived,
      normalDelivery: runningDelivery + newDelivery,
      idleReceived,
      idleDelivery,
    })
  }

  // 6. Strictly Separate Group 1 (NORMAL: RUNNING + NEW) and Group 2 (IDLE: IDLE only)
  const dailyRunning = aggregateCategoryFloorActivity(dailyReports, 'RUNNING')
  const dailyNew = aggregateCategoryFloorActivity(dailyReports, 'NEW')
  const dailyIdle = aggregateCategoryFloorActivity(dailyReports, 'IDLE')
  const dailyNormalCombined = combineNormalFloorActivity(dailyRunning, dailyNew)

  const monthlyRunning = aggregateCategoryFloorActivity(monthlyReports, 'RUNNING')
  const monthlyNew = aggregateCategoryFloorActivity(monthlyReports, 'NEW')
  const monthlyIdle = aggregateCategoryFloorActivity(monthlyReports, 'IDLE')
  const monthlyNormalCombined = combineNormalFloorActivity(monthlyRunning, monthlyNew)

  const stockRunning = aggregateCategoryFloorStock(dailyReports, 'RUNNING')
  const stockNew = aggregateCategoryFloorStock(dailyReports, 'NEW')
  const stockIdle = aggregateCategoryFloorStock(dailyReports, 'IDLE')
  const stockNormalCombined = combineNormalFloorStock(stockRunning, stockNew)

  // Separated Stock Distributions
  const normalStockDistribution = calculateNormalStockDistribution(
    stockRunning.totalStock,
    stockNew.totalStock,
    authorizedCategories
  )
  const idleStockDistributionByFloor = calculateIdleFloorDistribution(stockIdle)

  // Separated KPIs
  const normalKpis = calculateNormalKPIs({
    dailyRunning,
    dailyNew,
    monthlyRunning,
    monthlyNew,
    stockRunning,
    stockNew,
  })

  const idleKpis = calculateIdleKPIs({
    dailyIdle,
    monthlyIdle,
    stockIdle,
    totalAuthorizedFloorsCount: targetFloorIds.length,
  })

  // Separated Non-Moving Items
  const normalDailyReports = dailyReports.filter(
    (r) => r.category === 'RUNNING' || r.category === 'NEW'
  )
  const idleDailyReports = dailyReports.filter((r) => r.category === 'IDLE')

  const normalNonMoving = extractNonMovingItems({
    dailyReports: normalDailyReports,
    itemLastMovementMap: itemMovementMap,
    selectedDate: filters.date,
  })

  const idleNonMoving = extractNonMovingItems({
    dailyReports: idleDailyReports,
    itemLastMovementMap: itemMovementMap,
    selectedDate: filters.date,
  })

  return {
    filters,
    facilityKpis,
    normal: {
      kpis: normalKpis,
      dailyActivity: {
        RUNNING: dailyRunning,
        NEW: dailyNew,
        combined: dailyNormalCombined,
      },
      monthlyActivity: {
        RUNNING: monthlyRunning,
        NEW: monthlyNew,
        combined: monthlyNormalCombined,
      },
      floorStock: {
        RUNNING: stockRunning,
        NEW: stockNew,
        combined: stockNormalCombined,
      },
      stockDistribution: normalStockDistribution,
      nonMovingItems: normalNonMoving.nonMovingItems,
      nonMovingByFloor: normalNonMoving.nonMovingByFloor,
    },
    idle: {
      kpis: idleKpis,
      dailyActivity: dailyIdle,
      monthlyActivity: monthlyIdle,
      floorStock: stockIdle,
      stockDistributionByFloor: idleStockDistributionByFloor,
      nonMovingItems: idleNonMoving.nonMovingItems,
      nonMovingByFloor: idleNonMoving.nonMovingByFloor,
    },
    monthlyStockTrend: monthTrendPoints,
    authorizedFloorIds,
    authorizedCategories,
    allAuthorizedFloors,
    asOfDate: filters.date,
    asOfMonth: monthStr,
  }
}
