import type { DailyEntryCategory, Floor } from '@/types'

export interface DashboardFilters {
  date: string // YYYY-MM-DD
  floorId: string // 'all' or specific floor UUID
  category: 'ALL' | DailyEntryCategory
  month: number // 1 - 12
  year: number // e.g. 2026
}

export interface DashboardKPIData {
  needleBoothCount: number | null // null indicates "Not Available"
  manpowerCount: number | null // null indicates "Not Available"
  todayReceive: number
  todayDelivery: number
  monthlyReceive: number
  monthlyDelivery: number
  totalStockQty: number
}

export interface FloorReceiveDeliveryItem {
  floorId: string
  floorName: string
  floorCode: string | null
  received: number
  delivery: number
}

export interface CategoryFloorActivity {
  category: DailyEntryCategory
  items: FloorReceiveDeliveryItem[]
  totalReceived: number
  totalDelivery: number
}

export interface FloorStockItem {
  floorId: string
  floorName: string
  floorCode: string | null
  stock: number
}

export interface CategoryFloorStock {
  category: DailyEntryCategory
  items: FloorStockItem[]
  totalStock: number
}

export interface MonthlyClosingStockPoint {
  monthString: string // e.g. "2026-05"
  monthLabel: string // e.g. "May 2026"
  runningStock: number
  newStock: number
  idleStock: number
  totalStock: number
}

export interface NonMovingNeedleItem {
  floorId: string
  floorName: string
  floorCode: string | null
  needleItemId: string
  itemCode: string
  needleType: string
  sizeDia: string | null
  brand: string
  category: DailyEntryCategory
  currentStock: number
  lastMovementDate: string | null
  daysWithoutMovement: number
}

export interface StockDistributionItem {
  category: DailyEntryCategory
  label: string
  quantity: number
  percentage: number
  color: string
}

export interface DashboardData {
  filters: DashboardFilters
  kpis: DashboardKPIData
  dailyActivity: {
    RUNNING: CategoryFloorActivity
    NEW: CategoryFloorActivity
    IDLE: CategoryFloorActivity
  }
  monthlyActivity: {
    RUNNING: CategoryFloorActivity
    NEW: CategoryFloorActivity
    IDLE: CategoryFloorActivity
  }
  floorStock: {
    RUNNING: CategoryFloorStock
    NEW: CategoryFloorStock
    IDLE: CategoryFloorStock
  }
  monthlyStockTrend: MonthlyClosingStockPoint[]
  stockDistribution: StockDistributionItem[]
  nonMovingItems: NonMovingNeedleItem[]
  nonMovingByFloor: { floorId: string; floorName: string; count: number }[]
  authorizedFloorIds: string[]
  authorizedCategories: DailyEntryCategory[]
  allAuthorizedFloors: Floor[]
  asOfDate: string
  asOfMonth: string
}
