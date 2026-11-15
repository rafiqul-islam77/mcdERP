import type {
  DailyEntryCategory,
  DailyReportData,
  MonthlyReportData,
} from '@/types'
import type {
  CategoryFloorActivity,
  CategoryFloorStock,
  DashboardKPIData,
  FloorReceiveDeliveryItem,
  FloorStockItem,
  NonMovingNeedleItem,
  StockDistributionItem,
} from './dashboard-types'

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
 * Calculates stock distribution across authorized categories.
 * RUNNING = Blue (#3B82F6)
 * NEW = Purple (#8B5CF6)
 * IDLE = Amber (#F59E0B)
 */
export function calculateStockDistribution(
  runningStock: number,
  newStock: number,
  idleStock: number,
  authorizedCategories: DailyEntryCategory[]
): StockDistributionItem[] {
  const items: StockDistributionItem[] = []

  if (authorizedCategories.includes('RUNNING')) {
    items.push({
      category: 'RUNNING',
      label: 'Regular / Running',
      quantity: Math.max(0, runningStock),
      percentage: 0,
      color: '#3B82F6', // Blue
    })
  }

  if (authorizedCategories.includes('NEW')) {
    items.push({
      category: 'NEW',
      label: 'New Needle',
      quantity: Math.max(0, newStock),
      percentage: 0,
      color: '#8B5CF6', // Purple
    })
  }

  if (authorizedCategories.includes('IDLE')) {
    items.push({
      category: 'IDLE',
      label: 'Idle Needle',
      quantity: Math.max(0, idleStock),
      percentage: 0,
      color: '#F59E0B', // Amber
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
 * Calculates high-level KPI card values.
 * Needle Booth and Manpower return null to indicate "Not Available" per specifications.
 */
export function calculateKPIData(params: {
  todayReports: DailyReportData[]
  monthlyReports: MonthlyReportData[]
  authorizedCategories: DailyEntryCategory[]
  selectedFloorId?: string
}): DashboardKPIData {
  const { todayReports, monthlyReports, authorizedCategories, selectedFloorId } = params

  const filterReports = <T extends { floorId: string; category: DailyEntryCategory }>(
    list: T[]
  ): T[] => {
    return list.filter((r) => {
      if (!authorizedCategories.includes(r.category)) return false
      if (selectedFloorId && selectedFloorId !== 'all' && r.floorId !== selectedFloorId) {
        return false
      }
      return true
    })
  }

  const validDaily = filterReports(todayReports)
  const validMonthly = filterReports(monthlyReports)

  const todayReceive = validDaily.reduce((sum, r) => sum + r.summary.totalReceived, 0)
  const todayDelivery = validDaily.reduce((sum, r) => sum + r.summary.totalDelivery, 0)
  const totalStockQty = validDaily.reduce((sum, r) => sum + r.summary.totalPresent, 0)

  const monthlyReceive = validMonthly.reduce((sum, r) => sum + r.summary.totalReceived, 0)
  const monthlyDelivery = validMonthly.reduce((sum, r) => sum + r.summary.totalDelivery, 0)

  return {
    needleBoothCount: null, // "Not Available"
    manpowerCount: null, // "Not Available"
    todayReceive,
    todayDelivery,
    monthlyReceive,
    monthlyDelivery,
    totalStockQty,
  }
}

/**
 * Identifies needle items with positive stock but no qualifying stock movement
 * during the previous two calendar months.
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
  // Calculate cutoff: 60 days before selectedDate
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

      // If item was created within the last 60 days and has had no subsequent activity,
      // it is a newly introduced item, not a 2-month non-moving item.
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

  // Sort non-moving items by days without movement descending
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
