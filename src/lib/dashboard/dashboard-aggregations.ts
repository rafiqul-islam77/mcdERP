import type {
  DailyEntryCategory,
  DailyReportData,
  MonthlyReportData,
} from '@/types'
import type {
  CategoryFloorActivity,
  CategoryFloorStock,
  DistributionSlice,
  FloorReceiveDeliveryItem,
  FloorStockItem,
  IdleKPIData,
  NonMovingNeedleItem,
  NormalKPIData,
} from './dashboard-types'

const IDLE_FLOOR_PALETTE = [
  '#0D9488', // Teal
  '#F59E0B', // Amber
  '#F97316', // Orange
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#EA580C', // Deep Orange
  '#D97706', // Warm Amber
  '#64748B', // Slate for "Other"
]

/**
 * Aggregates floor-wise receive and delivery for a specific category
 * from daily or monthly report batches.
 */
export function aggregateCategoryFloorActivity(
  reports: (DailyReportData | MonthlyReportData)[],
  category: DailyEntryCategory
): CategoryFloorActivity {
  const matching = reports.filter((r) => r.category === category)

  const items: FloorReceiveDeliveryItem[] = matching.map((r) => ({
    floorId: r.floorId,
    floorName: r.floorName,
    floorCode: r.floorCode,
    received: r.summary.totalReceived,
    delivery: r.summary.totalDelivery,
  }))

  const totalReceived = items.reduce((sum, item) => sum + item.received, 0)
  const totalDelivery = items.reduce((sum, item) => sum + item.delivery, 0)

  return {
    category,
    items,
    totalReceived,
    totalDelivery,
  }
}

/**
 * Combines RUNNING and NEW floor activities into a Normal Needle floor summary.
 * Never includes IDLE.
 */
export function combineNormalFloorActivity(
  running: CategoryFloorActivity,
  newCat: CategoryFloorActivity
): CategoryFloorActivity {
  const floorMap = new Map<string, FloorReceiveDeliveryItem>()

  for (const item of running.items) {
    floorMap.set(item.floorId, { ...item })
  }

  for (const item of newCat.items) {
    const existing = floorMap.get(item.floorId)
    if (existing) {
      existing.received += item.received
      existing.delivery += item.delivery
    } else {
      floorMap.set(item.floorId, { ...item })
    }
  }

  const items = Array.from(floorMap.values())
  const totalReceived = running.totalReceived + newCat.totalReceived
  const totalDelivery = running.totalDelivery + newCat.totalDelivery

  return {
    category: 'NORMAL',
    items,
    totalReceived,
    totalDelivery,
  }
}

/**
 * Aggregates floor-wise stock quantities for a specific category.
 * Uses authoritative present balance from daily report data as of the selected date.
 */
export function aggregateCategoryFloorStock(
  reports: DailyReportData[],
  category: DailyEntryCategory
): CategoryFloorStock {
  const matching = reports.filter((r) => r.category === category)

  const items: FloorStockItem[] = matching.map((r) => ({
    floorId: r.floorId,
    floorName: r.floorName,
    floorCode: r.floorCode,
    stock: r.summary.totalPresent,
  }))

  const totalStock = items.reduce((sum, item) => sum + item.stock, 0)

  return {
    category,
    items,
    totalStock,
  }
}

/**
 * Combines RUNNING and NEW floor stocks into a Normal Needle floor stock summary.
 * Never includes IDLE.
 */
export function combineNormalFloorStock(
  running: CategoryFloorStock,
  newCat: CategoryFloorStock
): CategoryFloorStock {
  const floorMap = new Map<string, FloorStockItem>()

  for (const item of running.items) {
    floorMap.set(item.floorId, { ...item })
  }

  for (const item of newCat.items) {
    const existing = floorMap.get(item.floorId)
    if (existing) {
      existing.stock += item.stock
    } else {
      floorMap.set(item.floorId, { ...item })
    }
  }

  return {
    category: 'NORMAL',
    items: Array.from(floorMap.values()),
    totalStock: running.totalStock + newCat.totalStock,
  }
}

/**
 * Calculates Normal Needle stock distribution (RUNNING vs NEW only).
 * RUNNING = Royal Blue (#2563EB)
 * NEW = Purple (#8B5CF6)
 */
export function calculateNormalStockDistribution(
  runningStock: number,
  newStock: number,
  authorizedCategories: DailyEntryCategory[]
): DistributionSlice[] {
  const items: DistributionSlice[] = []

  if (authorizedCategories.includes('RUNNING')) {
    items.push({
      key: 'RUNNING',
      label: 'Regular',
      quantity: Math.max(0, runningStock),
      percentage: 0,
      color: '#2563EB', // Royal Blue
    })
  }

  if (authorizedCategories.includes('NEW')) {
    items.push({
      key: 'NEW',
      label: 'New Needle',
      quantity: Math.max(0, newStock),
      percentage: 0,
      color: '#8B5CF6', // Purple
    })
  }

  const grandTotal = items.reduce((acc, curr) => acc + curr.quantity, 0)
  for (const item of items) {
    item.percentage =
      grandTotal > 0 ? Math.round((item.quantity / grandTotal) * 1000) / 10 : 0
  }

  return items
}

/**
 * Calculates Idle Needle stock distribution by authorized Floor.
 * Uses real Idle closing stock per floor rather than inventing Normal categories.
 */
export function calculateIdleFloorDistribution(
  idleFloorStock: CategoryFloorStock
): DistributionSlice[] {
  const positiveFloors = idleFloorStock.items
    .filter((f) => f.stock > 0)
    .sort((a, b) => b.stock - a.stock)

  if (positiveFloors.length === 0) {
    return []
  }

  const grandTotal = positiveFloors.reduce((sum, f) => sum + f.stock, 0)
  const slices: DistributionSlice[] = []

  // Show top 7 floors individually, group remainder into "Other Floors"
  const topFloors = positiveFloors.slice(0, 7)
  const restFloors = positiveFloors.slice(7)

  topFloors.forEach((f, idx) => {
    slices.push({
      key: f.floorId,
      label: f.floorCode || f.floorName,
      quantity: f.stock,
      percentage: grandTotal > 0 ? Math.round((f.stock / grandTotal) * 1000) / 10 : 0,
      color: IDLE_FLOOR_PALETTE[idx % (IDLE_FLOOR_PALETTE.length - 1)],
    })
  })

  if (restFloors.length > 0) {
    const restSum = restFloors.reduce((sum, f) => sum + f.stock, 0)
    slices.push({
      key: 'OTHER_FLOORS',
      label: `Other (${restFloors.length} floors)`,
      quantity: restSum,
      percentage: grandTotal > 0 ? Math.round((restSum / grandTotal) * 1000) / 10 : 0,
      color: IDLE_FLOOR_PALETTE[IDLE_FLOOR_PALETTE.length - 1],
    })
  }

  return slices
}

/**
 * Calculates Normal Needle KPIs (RUNNING + NEW only; excludes IDLE).
 */
export function calculateNormalKPIs(params: {
  dailyRunning: CategoryFloorActivity
  dailyNew: CategoryFloorActivity
  monthlyRunning: CategoryFloorActivity
  monthlyNew: CategoryFloorActivity
  stockRunning: CategoryFloorStock
  stockNew: CategoryFloorStock
}): NormalKPIData {
  const {
    dailyRunning,
    dailyNew,
    monthlyRunning,
    monthlyNew,
    stockRunning,
    stockNew,
  } = params

  const runningStock = stockRunning.totalStock
  const newStock = stockNew.totalStock

  return {
    runningStock,
    newStock,
    totalNormalStock: runningStock + newStock,
    todayReceived: dailyRunning.totalReceived + dailyNew.totalReceived,
    todayRunningReceived: dailyRunning.totalReceived,
    todayNewReceived: dailyNew.totalReceived,
    todayDelivery: dailyRunning.totalDelivery + dailyNew.totalDelivery,
    todayRunningDelivery: dailyRunning.totalDelivery,
    todayNewDelivery: dailyNew.totalDelivery,
    monthlyReceived: monthlyRunning.totalReceived + monthlyNew.totalReceived,
    monthlyRunningReceived: monthlyRunning.totalReceived,
    monthlyNewReceived: monthlyNew.totalReceived,
    monthlyDelivery: monthlyRunning.totalDelivery + monthlyNew.totalDelivery,
    monthlyRunningDelivery: monthlyRunning.totalDelivery,
    monthlyNewDelivery: monthlyNew.totalDelivery,
  }
}

/**
 * Calculates Idle Needle KPIs (IDLE only).
 */
export function calculateIdleKPIs(params: {
  dailyIdle: CategoryFloorActivity
  monthlyIdle: CategoryFloorActivity
  stockIdle: CategoryFloorStock
  totalAuthorizedFloorsCount: number
}): IdleKPIData {
  const { dailyIdle, monthlyIdle, stockIdle, totalAuthorizedFloorsCount } = params

  const activeIdleFloorsCount = stockIdle.items.filter((f) => f.stock > 0).length

  return {
    totalIdleStock: stockIdle.totalStock,
    todayReceived: dailyIdle.totalReceived,
    todayDelivery: dailyIdle.totalDelivery,
    monthlyReceived: monthlyIdle.totalReceived,
    monthlyDelivery: monthlyIdle.totalDelivery,
    activeIdleFloorsCount,
    totalAuthorizedFloorsCount,
  }
}

/**
 * Identifies needle items with positive stock but no qualifying stock movement
 * during the previous two calendar months for a specific set of reports.
 *
 * Rules:
 * 1. Current stock > 0
 * 2. No qualifying transactions (RECEIVE, ISSUE, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT)
 *    within the last 2 calendar months relative to selectedDate.
 * 3. BNR records are explicitly EXCLUDED from qualifying stock movement.
 * 4. Exclude genuine newly introduced items that have not existed for 60 days.
 */
export function extractNonMovingItems(params: {
  dailyReports: DailyReportData[]
  itemLastMovementMap: Map<string, { lastDate: string | null; firstDate: string | null }>
  selectedDate: string
}): {
  nonMovingItems: NonMovingNeedleItem[]
  nonMovingByFloor: { floorId: string; floorName: string; count: number }[]
} {
  const { dailyReports, itemLastMovementMap, selectedDate } = params

  const selDateObj = new Date(selectedDate)
  const twoMonthsAgoObj = new Date(selDateObj)
  twoMonthsAgoObj.setDate(twoMonthsAgoObj.getDate() - 60)
  const cutoffDateStr = twoMonthsAgoObj.toISOString().slice(0, 10)

  const nonMovingItems: NonMovingNeedleItem[] = []
  const floorCountMap = new Map<string, { floorName: string; count: number }>()

  for (const report of dailyReports) {
    if (!floorCountMap.has(report.floorId)) {
      floorCountMap.set(report.floorId, { floorName: report.floorName, count: 0 })
    }

    for (const row of report.rows) {
      if (row.present <= 0) continue

      const key = `${report.floorId}__${report.category}__${row.needle_item_id}`
      const movementInfo = itemLastMovementMap.get(key)
      const lastDate = movementInfo?.lastDate || null
      const firstDate = movementInfo?.firstDate || null

      if (firstDate && firstDate > cutoffDateStr && !lastDate) {
        continue
      }

      const isNonMoving = !lastDate || lastDate < cutoffDateStr

      if (isNonMoving) {
        let daysWithoutMovement = 60
        if (lastDate) {
          const lastDateObj = new Date(lastDate)
          const diffMs = selDateObj.getTime() - lastDateObj.getTime()
          daysWithoutMovement = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
        } else if (firstDate) {
          const firstDateObj = new Date(firstDate)
          const diffMs = selDateObj.getTime() - firstDateObj.getTime()
          daysWithoutMovement = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
        }

        nonMovingItems.push({
          floorId: report.floorId,
          floorName: report.floorName,
          floorCode: report.floorCode,
          needleItemId: row.needle_item_id,
          itemCode: row.item_code,
          needleType: row.needle_type,
          sizeDia: row.size_dia,
          brand: row.brand,
          category: report.category,
          currentStock: row.present,
          lastMovementDate: lastDate,
          daysWithoutMovement,
        })

        const fl = floorCountMap.get(report.floorId)
        if (fl) {
          fl.count++
        }
      }
    }
  }

  nonMovingItems.sort((a, b) => b.daysWithoutMovement - a.daysWithoutMovement)

  const nonMovingByFloor = Array.from(floorCountMap.entries()).map(([floorId, val]) => ({
    floorId,
    floorName: val.floorName,
    count: val.count,
  }))

  return {
    nonMovingItems,
    nonMovingByFloor,
  }
}
