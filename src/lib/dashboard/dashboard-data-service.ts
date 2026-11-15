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
  calculateKPIData,
  calculateStockDistribution,
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

/**
 * Coordinated Dashboard Data Service
 *
 * Implements the required pipeline:
 * 1. Resolves authorized floors and categories for the current actor.
 * 2. Fetches authoritative Daily Report data via getBatchDailyReportData()
 *    (which uses fetchAllRowsPaginated in 500-record batches).
 * 3. Fetches authoritative Monthly Report data via getBatchMonthlyReportData()
 *    (which also uses fetchAllRowsPaginated in 500-record batches).
 * 4. Extracts transaction movement dates for 2-month non-moving items.
 * 5. Computes 12-month closing stock trends without double-counting.
 * 6. Aggregates KPI cards and chart datasets from the verified complete dataset.
 */
export async function getDashboardData(
  filters: DashboardFilters,
  actor: CurrentUser,
  allAuthorizedFloors: Floor[],
  authorizedCategories: DailyEntryCategory[]
): Promise<DashboardData> {
  const admin = getAdminClient()

  // 1. Determine target floors
  const authorizedFloorIds = allAuthorizedFloors.map((f) => f.id)
  let targetFloorIds: string[] = []

  if (filters.floorId === 'all') {
    targetFloorIds = authorizedFloorIds
  } else {
    // Only allow if user is authorized for this floor
    if (authorizedFloorIds.includes(filters.floorId)) {
      targetFloorIds = [filters.floorId]
    } else {
      targetFloorIds = authorizedFloorIds
    }
  }

  // 2. Determine target categories
  let targetCategories: DailyEntryCategory[] = []
  if (filters.category === 'ALL') {
    targetCategories = authorizedCategories
  } else {
    if (authorizedCategories.includes(filters.category)) {
      targetCategories = [filters.category]
    } else {
      targetCategories = authorizedCategories
    }
  }

  // Guard against empty floors/categories
  if (targetFloorIds.length === 0 || targetCategories.length === 0) {
    const emptyActivity = (cat: DailyEntryCategory) => ({
      category: cat,
      items: [],
      totalReceived: 0,
      totalDelivery: 0,
    })
    const emptyStock = (cat: DailyEntryCategory) => ({
      category: cat,
      items: [],
      totalStock: 0,
    })

    return {
      filters,
      kpis: {
        needleBoothCount: null,
        manpowerCount: null,
        todayReceive: 0,
        todayDelivery: 0,
        monthlyReceive: 0,
        monthlyDelivery: 0,
        totalStockQty: 0,
      },
      dailyActivity: {
        RUNNING: emptyActivity('RUNNING'),
        NEW: emptyActivity('NEW'),
        IDLE: emptyActivity('IDLE'),
      },
      monthlyActivity: {
        RUNNING: emptyActivity('RUNNING'),
        NEW: emptyActivity('NEW'),
        IDLE: emptyActivity('IDLE'),
      },
      floorStock: {
        RUNNING: emptyStock('RUNNING'),
        NEW: emptyStock('NEW'),
        IDLE: emptyStock('IDLE'),
      },
      monthlyStockTrend: [],
      stockDistribution: [],
      nonMovingItems: [],
      nonMovingByFloor: [],
      authorizedFloorIds,
      authorizedCategories,
      allAuthorizedFloors,
      asOfDate: filters.date,
      asOfMonth: `${filters.year}-${String(filters.month).padStart(2, '0')}`,
    }
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
  const monthStr = `${filters.year}-${String(filters.month).padStart(2, '0')}`
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

  // 5. Build Movement History for Non-Moving Items Analysis (using batch pagination)
  // Maps key: `${floor_id}__${category}__${needle_item_id}` -> { lastDate, firstDate }
  const itemMovementMap = new Map<
    string,
    { lastDate: string | null; firstDate: string | null }
  >()

  const recordMovement = (
    floorId: string,
    cat: DailyEntryCategory,
    needleId: string,
    txDate: string,
    isQualifyingMovement: boolean
  ) => {
    const key = `${floorId}__${cat}__${needleId}`
    const cur = itemMovementMap.get(key) || { lastDate: null, firstDate: null }

    if (!cur.firstDate || txDate < cur.firstDate) {
      cur.firstDate = txDate
    }

    if (isQualifyingMovement) {
      if (!cur.lastDate || txDate > cur.lastDate) {
        cur.lastDate = txDate
      }
    }

    itemMovementMap.set(key, cur)
  }

  // Qualifying transaction types that constitute stock movement (excluding BNR)
  const qualifyingTypes = new Set([
    'RECEIVE',
    'ISSUE',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
  ])

  // Batch load transactions up to filters.date using fetchAllRowsPaginated
  if (targetCategories.includes('RUNNING')) {
    const runTxs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_running_transactions')
        .select('needle_item_id, floor_id, transaction_date, transaction_type')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', filters.date)
        .order('id', { ascending: true })
    )
    for (const tx of runTxs) {
      recordMovement(
        tx.floor_id,
        'RUNNING',
        tx.needle_item_id,
        tx.transaction_date,
        qualifyingTypes.has(tx.transaction_type)
      )
    }
  }

  if (targetCategories.includes('NEW')) {
    const newTxs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_new_transactions')
        .select('needle_item_id, floor_id, transaction_date, transaction_type')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', filters.date)
        .order('id', { ascending: true })
    )
    for (const tx of newTxs) {
      recordMovement(
        tx.floor_id,
        'NEW',
        tx.needle_item_id,
        tx.transaction_date,
        qualifyingTypes.has(tx.transaction_type)
      )
    }
  }

  if (targetCategories.includes('IDLE')) {
    const idleTxs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_idle_transactions')
        .select('needle_item_id, floor_id, transaction_date, transaction_type')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', filters.date)
        .order('id', { ascending: true })
    )
    for (const tx of idleTxs) {
      recordMovement(
        tx.floor_id,
        'IDLE',
        tx.needle_item_id,
        tx.transaction_date,
        qualifyingTypes.has(tx.transaction_type)
      )
    }
  }

  // 6. Compute 12-Month Closing Stock Trends
  // Determine 12 consecutive months ending at the selected month/year
  const monthTrendPoints: MonthlyClosingStockPoint[] = []
  const monthTargets: { year: number; month: number; monthString: string; label: string; endDate: string }[] = []

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
      endDate: boundaries.monthEnd,
    })
  }

  // Batch query transaction balances across time to get monthly closing stocks accurately
  // For each monthTarget, closing stock = sum of inflows <= endDate - sum of outflows <= endDate
  const calculateCategoryClosingStockAt = async (
    table: string,
    cutoffDate: string
  ): Promise<number> => {
    // Only query if authorized category
    const rows = await fetchAllRowsPaginated<any>(() =>
      admin
        .from(table)
        .select('quantity, transaction_type')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', cutoffDate)
    )

    let bal = 0
    for (const r of rows) {
      const q = Number(r.quantity) || 0
      switch (r.transaction_type) {
        case 'OPENING':
        case 'RECEIVE':
        case 'TRANSFER_IN':
        case 'ADJUSTMENT_IN':
          bal += q
          break
        case 'ISSUE':
        case 'TRANSFER_OUT':
        case 'ADJUSTMENT_OUT':
          bal -= q
          break
      }
    }
    return Math.max(0, bal)
  }

  // Pre-load all transactions once to compute all 12 monthly closing balances in-memory
  // This satisfies the requirement: "Do not repeatedly download the same dataset for different charts."
  const preloadedTransactions: { category: DailyEntryCategory; txs: any[] }[] = []

  if (targetCategories.includes('RUNNING')) {
    const txs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_running_transactions')
        .select('quantity, transaction_type, transaction_date')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', monthTargets[monthTargets.length - 1].endDate)
        .order('id', { ascending: true })
    )
    preloadedTransactions.push({ category: 'RUNNING', txs })
  }

  if (targetCategories.includes('NEW')) {
    const txs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_new_transactions')
        .select('quantity, transaction_type, transaction_date')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', monthTargets[monthTargets.length - 1].endDate)
        .order('id', { ascending: true })
    )
    preloadedTransactions.push({ category: 'NEW', txs })
  }

  if (targetCategories.includes('IDLE')) {
    const txs = await fetchAllRowsPaginated<any>(() =>
      admin
        .from('needle_idle_transactions')
        .select('quantity, transaction_type, transaction_date')
        .in('floor_id', targetFloorIds)
        .lte('transaction_date', monthTargets[monthTargets.length - 1].endDate)
        .order('id', { ascending: true })
    )
    preloadedTransactions.push({ category: 'IDLE', txs })
  }

  for (const target of monthTargets) {
    let runningStock = 0
    let newStock = 0
    let idleStock = 0

    for (const bucket of preloadedTransactions) {
      let bBalance = 0
      for (const t of bucket.txs) {
        if (t.transaction_date <= target.endDate) {
          const q = Number(t.quantity) || 0
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
      }
      if (bucket.category === 'RUNNING') runningStock = Math.max(0, bBalance)
      if (bucket.category === 'NEW') newStock = Math.max(0, bBalance)
      if (bucket.category === 'IDLE') idleStock = Math.max(0, bBalance)
    }

    const totalStock = runningStock + newStock + idleStock

    monthTrendPoints.push({
      monthString: target.monthString,
      monthLabel: target.label,
      runningStock,
      newStock,
      idleStock,
      totalStock,
    })
  }

  // 7. Aggregate Metrics
  // Daily Activity (RUNNING, NEW, IDLE)
  const dailyActivity = {
    RUNNING: aggregateCategoryFloorActivity(dailyReports, 'RUNNING'),
    NEW: aggregateCategoryFloorActivity(dailyReports, 'NEW'),
    IDLE: aggregateCategoryFloorActivity(dailyReports, 'IDLE'),
  }

  // Monthly Activity (RUNNING, NEW, IDLE)
  const monthlyActivity = {
    RUNNING: aggregateCategoryFloorActivity(monthlyReports, 'RUNNING'),
    NEW: aggregateCategoryFloorActivity(monthlyReports, 'NEW'),
    IDLE: aggregateCategoryFloorActivity(monthlyReports, 'IDLE'),
  }

  // Floor Stocks (RUNNING, NEW, IDLE)
  const floorStock = {
    RUNNING: aggregateCategoryFloorStock(dailyReports, 'RUNNING'),
    NEW: aggregateCategoryFloorStock(dailyReports, 'NEW'),
    IDLE: aggregateCategoryFloorStock(dailyReports, 'IDLE'),
  }

  // Current Stock Distribution
  const stockDistribution = calculateStockDistribution(
    floorStock.RUNNING.totalStock,
    floorStock.NEW.totalStock,
    floorStock.IDLE.totalStock,
    authorizedCategories
  )

  // Top KPI Cards
  const kpis = calculateKPIData({
    todayReports: dailyReports,
    monthlyReports: monthlyReports,
    authorizedCategories,
    selectedFloorId: filters.floorId,
  })

  // 8. Extract 2-Month Non-Moving Items
  const { nonMovingItems, nonMovingByFloor } = extractNonMovingItems({
    dailyReports,
    itemLastMovementMap: itemMovementMap,
    selectedDate: filters.date,
  })

  return {
    filters,
    kpis,
    dailyActivity,
    monthlyActivity,
    floorStock,
    monthlyStockTrend: monthTrendPoints,
    stockDistribution,
    nonMovingItems,
    nonMovingByFloor,
    authorizedFloorIds,
    authorizedCategories,
    allAuthorizedFloors,
    asOfDate: filters.date,
    asOfMonth: monthStr,
  }
}
