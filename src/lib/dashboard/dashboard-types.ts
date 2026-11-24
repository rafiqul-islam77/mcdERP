import type { DailyEntryCategory, Floor } from '@/types'

export type DashboardGroupKey = 'NORMAL' | 'IDLE'
export type NormalSubCategoryFilter = 'ALL_NORMAL' | 'RUNNING' | 'NEW'

export interface DashboardFilters {
  date: string // YYYY-MM-DD
  floorId: string // 'all' or specific floor UUID
  category: 'ALL' | DailyEntryCategory
  month: number // 1 - 12
  year: number // e.g. 2026
}

export interface FacilityKPIData {
  needleBoothCount: number | null // null indicates "Not Available"
  manpowerCount: number | null // null indicates "Not Available"
}

export interface NormalKPIData {
  runningStock: number
  newStock: number
  totalNormalStock: number
  todayReceived: number
  todayRunningReceived: number
  todayNewReceived: number
  todayDelivery: number
  todayRunningDelivery: number
  todayNewDelivery: number
  monthlyReceived: number
  monthlyRunningReceived: number
  monthlyNewReceived: number
  monthlyDelivery: number
  monthlyRunningDelivery: number
  monthlyNewDelivery: number
}

export interface IdleKPIData {
  totalIdleStock: number
  todayReceived: number
  todayDelivery: number
  monthlyReceived: number
  monthlyDelivery: number
  activeIdleFloorsCount: number
  totalAuthorizedFloorsCount: number
}

export interface FloorReceiveDeliveryItem {
  floorId: string
  floorName: string
  floorCode: string | null
  received: number
  delivery: number
}

export interface CategoryFloorActivity {
  category: DailyEntryCategory | 'NORMAL'
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
  category: DailyEntryCategory | 'NORMAL'
  items: FloorStockItem[]
  totalStock: number
}

export interface MonthlyClosingStockPoint {
  monthString: string // e.g. "2026-05"
  monthLabel: string // e.g. "May '26"
  runningStock: number
  newStock: number
  normalTotalStock: number // runningStock + newStock (never includes idle)
  idleStock: number
  runningReceived: number
  runningDelivery: number
  newReceived: number
  newDelivery: number
  normalReceived: number // runningReceived + newReceived
  normalDelivery: number // runningDelivery + newDelivery
  idleReceived: number
  idleDelivery: number
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

export interface DistributionSlice {
  key: string
  label: string
  quantity: number
  percentage: number
  color: string
}

export interface NormalDashboardGroupData {
  kpis: NormalKPIData
  dailyActivity: {
    RUNNING: CategoryFloorActivity
    NEW: CategoryFloorActivity
    combined: CategoryFloorActivity
  }
  monthlyActivity: {
    RUNNING: CategoryFloorActivity
    NEW: CategoryFloorActivity
    combined: CategoryFloorActivity
  }
  floorStock: {
    RUNNING: CategoryFloorStock
    NEW: CategoryFloorStock
    combined: CategoryFloorStock
  }
  stockDistribution: DistributionSlice[]
  nonMovingItems: NonMovingNeedleItem[]
  nonMovingByFloor: { floorId: string; floorName: string; count: number }[]
}

export interface IdleDashboardGroupData {
  kpis: IdleKPIData
  dailyActivity: CategoryFloorActivity
  monthlyActivity: CategoryFloorActivity
  floorStock: CategoryFloorStock
  stockDistributionByFloor: DistributionSlice[]
  nonMovingItems: NonMovingNeedleItem[]
  nonMovingByFloor: { floorId: string; floorName: string; count: number }[]
}

export interface DashboardData {
  filters: DashboardFilters
  facilityKpis: FacilityKPIData
  normal: NormalDashboardGroupData
  idle: IdleDashboardGroupData
  monthlyStockTrend: MonthlyClosingStockPoint[]
  authorizedFloorIds: string[]
  authorizedCategories: DailyEntryCategory[]
  allAuthorizedFloors: Floor[]
  asOfDate: string
  asOfMonth: string
}
