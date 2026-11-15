'use client'

import * as React from 'react'
import {
  Calendar,
  Layers,
  BarChart3,
  PieChart,
  Clock,
  AlertCircle,
  TrendingUp,
  Boxes,
} from 'lucide-react'
import type { DailyEntryCategory, Floor } from '@/types'
import type { DashboardData, DashboardFilters } from '@/lib/dashboard/dashboard-types'
import { getDashboardDataAction } from '@/app/actions/dashboard'
import { DashboardFiltersBar } from './dashboard-filters'
import { DashboardKPICards } from './dashboard-kpi-cards'
import { DashboardSkeleton } from './dashboard-skeleton'
import { DashboardSection } from './dashboard-section'
import { FloorReceiveDeliveryChart } from './floor-receive-delivery-chart'
import { ReceiveDeliveryDonut } from './receive-delivery-donut'
import { FloorStockChart, TotalFloorStockCard } from './floor-stock-chart'
import { MonthlyStockChart, TotalMonthlyStockSummaryCard } from './monthly-stock-chart'
import {
  TotalMonthlyStockChart,
  TotalMonthlyCombinedSummaryCard,
} from './total-monthly-stock-chart'
import { StockDistributionChart } from './stock-distribution-chart'
import { NonMovingNeedleSection } from './non-moving-needle-section'
import { useDashboardRealtime } from './use-dashboard-realtime'

interface DashboardClientProps {
  initialFloors: Floor[]
  allowedCategories: DailyEntryCategory[]
  initialDate: string
}

export function DashboardClient({
  initialFloors,
  allowedCategories,
  initialDate,
}: DashboardClientProps) {
  // Parse initial date
  const [initYear, initMonth] = React.useMemo(() => {
    const parts = (initialDate || new Date().toISOString().slice(0, 10)).split('-')
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)]
  }, [initialDate])

  const [filters, setFilters] = React.useState<DashboardFilters>({
    date: initialDate || new Date().toISOString().slice(0, 10),
    floorId: 'all',
    category: 'ALL',
    month: !isNaN(initMonth) ? initMonth : new Date().getMonth() + 1,
    year: !isNaN(initYear) ? initYear : new Date().getFullYear(),
  })

  const [dashboardData, setDashboardData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  // Coordinated Data Loading Function
  const loadDashboard = React.useCallback(async (currentFilters: DashboardFilters) => {
    setLoading(true)
    setError(null)

    try {
      const res = await getDashboardDataAction(currentFilters)
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load dashboard data.')
      } else {
        setDashboardData(res.data)
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected network error occurred.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  React.useEffect(() => {
    loadDashboard(filters)
  }, [loadDashboard, filters])

  // Realtime updates with 3s debounce
  useDashboardRealtime({
    enabled: true,
    onDataChange: () => {
      loadDashboard(filters)
    },
    debounceMs: 3000,
  })

  const handleFilterChange = (newFilters: DashboardFilters) => {
    setFilters(newFilters)
  }

  const handleRefresh = () => {
    loadDashboard(filters)
  }

  const selectedMonthLabel = React.useMemo(() => {
    const months = [
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
    return `${months[filters.month - 1]} ${filters.year}`
  }, [filters.month, filters.year])

  // Category visibility flags
  const showRunning =
    (filters.category === 'ALL' || filters.category === 'RUNNING') &&
    allowedCategories.includes('RUNNING')

  const showNew =
    (filters.category === 'ALL' || filters.category === 'NEW') &&
    allowedCategories.includes('NEW')

  const showIdle =
    (filters.category === 'ALL' || filters.category === 'IDLE') &&
    allowedCategories.includes('IDLE')

  return (
    <div className="space-y-6">
      {/* ── 1. Top Filters Bar ── */}
      <DashboardFiltersBar
        filters={filters}
        onChange={handleFilterChange}
        onRefresh={handleRefresh}
        loading={loading}
        allAuthorizedFloors={initialFloors}
        authorizedCategories={allowedCategories}
      />

      {/* Error state */}
      {error && (
        <div className="p-3.5 rounded-erp bg-danger/10 border border-danger/30 text-danger text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="px-2.5 py-1 rounded bg-danger text-white text-[11px] font-bold hover:bg-danger/90"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state vs Live Dashboard Content */}
      {loading && !dashboardData ? (
        <DashboardSkeleton />
      ) : dashboardData ? (
        <div className="space-y-6">
          {/* ── 2. Top 7 Primary KPI Cards ── */}
          <DashboardKPICards
            kpis={dashboardData.kpis}
            selectedDate={filters.date}
            selectedMonthLabel={selectedMonthLabel}
          />

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* SCREENSHOT 1: TODAY FLOOR-WISE RECEIVE & DELIVERY                    */}
          {/* ═════════════════════════════════════════════════════════════════════ */}

          {/* SECTION 7: TODAY — RUNNING NEEDLE */}
          {showRunning && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="TODAY FLOOR-WISE RECEIVE & DELIVERY (RUNNING NEEDLE)"
                  subtitle={`Floor activity for ${filters.date}`}
                  icon={<BarChart3 className="w-4 h-4 text-blue-600" />}
                  accentColor="border-l-blue-500"
                  badge={
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase">
                      RUNNING
                    </span>
                  }
                >
                  <FloorReceiveDeliveryChart
                    items={dashboardData.dailyActivity.RUNNING.items}
                    receivedColor="#10B981"
                    deliveryColor="#F97316"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL RECEIVE & DELIVERY — RUNNING"
                  subtitle="Activity mix ratio"
                  icon={<PieChart className="w-4 h-4 text-blue-600" />}
                  accentColor="border-l-blue-500"
                >
                  <ReceiveDeliveryDonut
                    totalReceived={dashboardData.dailyActivity.RUNNING.totalReceived}
                    totalDelivery={dashboardData.dailyActivity.RUNNING.totalDelivery}
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 8: TODAY — NEW NEEDLE */}
          {showNew && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="TODAY FLOOR-WISE RECEIVE & DELIVERY (NEW NEEDLE)"
                  subtitle={`Floor activity for ${filters.date}`}
                  icon={<BarChart3 className="w-4 h-4 text-purple-600" />}
                  accentColor="border-l-purple-500"
                  badge={
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase">
                      NEW NEEDLE
                    </span>
                  }
                >
                  <FloorReceiveDeliveryChart
                    items={dashboardData.dailyActivity.NEW.items}
                    receivedColor="#10B981"
                    deliveryColor="#F97316"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL RECEIVE & DELIVERY — NEW"
                  subtitle="Activity mix ratio"
                  icon={<PieChart className="w-4 h-4 text-purple-600" />}
                  accentColor="border-l-purple-500"
                >
                  <ReceiveDeliveryDonut
                    totalReceived={dashboardData.dailyActivity.NEW.totalReceived}
                    totalDelivery={dashboardData.dailyActivity.NEW.totalDelivery}
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 9: TODAY — IDLE NEEDLE */}
          {showIdle && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="TODAY FLOOR-WISE RECEIVE & DELIVERY (IDLE NEEDLE)"
                  subtitle={`Floor activity for ${filters.date}`}
                  icon={<BarChart3 className="w-4 h-4 text-amber-600" />}
                  accentColor="border-l-amber-500"
                  badge={
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase">
                      IDLE NEEDLE
                    </span>
                  }
                >
                  <FloorReceiveDeliveryChart
                    items={dashboardData.dailyActivity.IDLE.items}
                    receivedColor="#10B981"
                    deliveryColor="#F97316"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL RECEIVE & DELIVERY — IDLE"
                  subtitle="Activity mix ratio"
                  icon={<PieChart className="w-4 h-4 text-amber-600" />}
                  accentColor="border-l-amber-500"
                >
                  <ReceiveDeliveryDonut
                    totalReceived={dashboardData.dailyActivity.IDLE.totalReceived}
                    totalDelivery={dashboardData.dailyActivity.IDLE.totalDelivery}
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* SCREENSHOT 2: MONTH & FLOOR-WISE ACTIVITY AND FLOOR-WISE STOCK        */}
          {/* ═════════════════════════════════════════════════════════════════════ */}

          {/* SECTION 10: MONTH & FLOOR-WISE — RUNNING NEEDLE */}
          {showRunning && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (RUNNING NEEDLE)"
                  subtitle={`Monthly totals for ${selectedMonthLabel}`}
                  icon={<BarChart3 className="w-4 h-4 text-blue-600" />}
                  accentColor="border-l-blue-500"
                  badge={
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase">
                      MONTHLY RUNNING
                    </span>
                  }
                >
                  <FloorReceiveDeliveryChart
                    items={dashboardData.monthlyActivity.RUNNING.items}
                    receivedColor="#10B981"
                    deliveryColor="#F97316"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL MONTHLY RECEIVE & DELIVERY — RUNNING"
                  subtitle={selectedMonthLabel}
                  icon={<PieChart className="w-4 h-4 text-blue-600" />}
                  accentColor="border-l-blue-500"
                >
                  <ReceiveDeliveryDonut
                    totalReceived={dashboardData.monthlyActivity.RUNNING.totalReceived}
                    totalDelivery={dashboardData.monthlyActivity.RUNNING.totalDelivery}
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 11: MONTH & FLOOR-WISE — NEW NEEDLE */}
          {showNew && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (NEW NEEDLE)"
                  subtitle={`Monthly totals for ${selectedMonthLabel}`}
                  icon={<BarChart3 className="w-4 h-4 text-purple-600" />}
                  accentColor="border-l-purple-500"
                  badge={
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase">
                      MONTHLY NEW
                    </span>
                  }
                >
                  <FloorReceiveDeliveryChart
                    items={dashboardData.monthlyActivity.NEW.items}
                    receivedColor="#10B981"
                    deliveryColor="#F97316"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL MONTHLY RECEIVE & DELIVERY — NEW"
                  subtitle={selectedMonthLabel}
                  icon={<PieChart className="w-4 h-4 text-purple-600" />}
                  accentColor="border-l-purple-500"
                >
                  <ReceiveDeliveryDonut
                    totalReceived={dashboardData.monthlyActivity.NEW.totalReceived}
                    totalDelivery={dashboardData.monthlyActivity.NEW.totalDelivery}
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 12: MONTH & FLOOR-WISE — IDLE NEEDLE */}
          {showIdle && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (IDLE NEEDLE)"
                  subtitle={`Monthly totals for ${selectedMonthLabel}`}
                  icon={<BarChart3 className="w-4 h-4 text-amber-600" />}
                  accentColor="border-l-amber-500"
                  badge={
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase">
                      MONTHLY IDLE
                    </span>
                  }
                >
                  <FloorReceiveDeliveryChart
                    items={dashboardData.monthlyActivity.IDLE.items}
                    receivedColor="#10B981"
                    deliveryColor="#F97316"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL MONTHLY RECEIVE & DELIVERY — IDLE"
                  subtitle={selectedMonthLabel}
                  icon={<PieChart className="w-4 h-4 text-amber-600" />}
                  accentColor="border-l-amber-500"
                >
                  <ReceiveDeliveryDonut
                    totalReceived={dashboardData.monthlyActivity.IDLE.totalReceived}
                    totalDelivery={dashboardData.monthlyActivity.IDLE.totalDelivery}
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 13: FLOOR-WISE STOCK QUANTITY — RUNNING */}
          {showRunning && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="FLOOR-WISE STOCK QTY (RUNNING)"
                  subtitle={`Present balance as of ${filters.date}`}
                  icon={<Boxes className="w-4 h-4 text-blue-600" />}
                  accentColor="border-l-blue-500"
                >
                  <FloorStockChart
                    items={dashboardData.floorStock.RUNNING.items}
                    color="#3B82F6"
                    categoryLabel="Running Needle"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL FLOOR-WISE STOCK QTY (PCS)"
                  subtitle="Running stock summary"
                  accentColor="border-l-blue-500"
                >
                  <TotalFloorStockCard
                    totalStock={dashboardData.floorStock.RUNNING.totalStock}
                    floorCount={dashboardData.floorStock.RUNNING.items.length}
                    categoryLabel="Running Needle"
                    color="text-blue-600"
                    bgColor="bg-blue-50/60"
                    borderColor="border-blue-200"
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 14: FLOOR-WISE STOCK QUANTITY — NEW */}
          {showNew && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="FLOOR-WISE STOCK QTY (NEW)"
                  subtitle={`Present balance as of ${filters.date}`}
                  icon={<Boxes className="w-4 h-4 text-purple-600" />}
                  accentColor="border-l-purple-500"
                >
                  <FloorStockChart
                    items={dashboardData.floorStock.NEW.items}
                    color="#8B5CF6"
                    categoryLabel="New Needle"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL FLOOR-WISE STOCK QTY (PCS)"
                  subtitle="New needle stock summary"
                  accentColor="border-l-purple-500"
                >
                  <TotalFloorStockCard
                    totalStock={dashboardData.floorStock.NEW.totalStock}
                    floorCount={dashboardData.floorStock.NEW.items.length}
                    categoryLabel="New Needle"
                    color="text-purple-600"
                    bgColor="bg-purple-50/60"
                    borderColor="border-purple-200"
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* SCREENSHOT 3: MONTH-WISE STOCK QUANTITIES & NON-MOVING SECTION       */}
          {/* ═════════════════════════════════════════════════════════════════════ */}

          {/* SECTION 15: MONTH-WISE STOCK QUANTITY — RUNNING */}
          {showRunning && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="MONTH-WISE STOCK QTY (RUNNING)"
                  subtitle="12-Month closing stock balance trend"
                  icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
                  accentColor="border-l-blue-500"
                >
                  <MonthlyStockChart
                    trendPoints={dashboardData.monthlyStockTrend}
                    dataKey="runningStock"
                    color="#3B82F6"
                    gradientId="runningStockGrad"
                    categoryLabel="Running Needle"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL MONTH-WISE STOCK QTY (PCS)"
                  subtitle="Latest month closing"
                  accentColor="border-l-blue-500"
                >
                  <TotalMonthlyStockSummaryCard
                    trendPoints={dashboardData.monthlyStockTrend}
                    dataKey="runningStock"
                    categoryLabel="Running Needle"
                    color="text-blue-600"
                    bgColor="bg-blue-50/60"
                    borderColor="border-blue-200"
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 16: MONTH-WISE STOCK QUANTITY — NEW */}
          {showNew && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashboardSection
                  title="MONTH-WISE STOCK QTY (NEW)"
                  subtitle="12-Month closing stock balance trend"
                  icon={<TrendingUp className="w-4 h-4 text-purple-600" />}
                  accentColor="border-l-purple-500"
                >
                  <MonthlyStockChart
                    trendPoints={dashboardData.monthlyStockTrend}
                    dataKey="newStock"
                    color="#8B5CF6"
                    gradientId="newStockGrad"
                    categoryLabel="New Needle"
                  />
                </DashboardSection>
              </div>

              <div>
                <DashboardSection
                  title="TOTAL MONTH-WISE STOCK QTY (PCS)"
                  subtitle="Latest month closing"
                  accentColor="border-l-purple-500"
                >
                  <TotalMonthlyStockSummaryCard
                    trendPoints={dashboardData.monthlyStockTrend}
                    dataKey="newStock"
                    categoryLabel="New Needle"
                    color="text-purple-600"
                    bgColor="bg-purple-50/60"
                    borderColor="border-purple-200"
                  />
                </DashboardSection>
              </div>
            </div>
          )}

          {/* SECTION 17: TOTAL MONTH-WISE STOCK QTY (ALL CATEGORIES) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <DashboardSection
                title="TOTAL MONTH-WISE STOCK QTY"
                subtitle="Combined stacked closing stock across authorized categories"
                icon={<BarChart3 className="w-4 h-4 text-indigo-600" />}
                accentColor="border-l-indigo-500"
              >
                <TotalMonthlyStockChart
                  trendPoints={dashboardData.monthlyStockTrend}
                  authorizedCategories={allowedCategories}
                />
              </DashboardSection>
            </div>

            <div>
              <DashboardSection
                title="TOTAL MONTH-WISE STOCK QTY (PCS)"
                subtitle="All categories combined"
                accentColor="border-l-indigo-500"
              >
                <TotalMonthlyCombinedSummaryCard
                  trendPoints={dashboardData.monthlyStockTrend}
                  authorizedCategories={allowedCategories}
                />
              </DashboardSection>
            </div>
          </div>

          {/* SECTION 19: CURRENT STOCK DISTRIBUTION */}
          <div>
            <DashboardSection
              title="CURRENT STOCK DISTRIBUTION"
              subtitle={`Inventory category breakdown as of ${filters.date}`}
              icon={<PieChart className="w-4 h-4 text-teal-600" />}
              accentColor="border-l-teal-500"
            >
              <StockDistributionChart items={dashboardData.stockDistribution} />
            </DashboardSection>
          </div>

          {/* SECTION 18: FLOOR-WISE NOT MOVING ITEM — 02 MONTH */}
          <div>
            <DashboardSection
              title="FLOOR-WISE NOT MOVING ITEM — 02 MONTH"
              subtitle={`Needle items with balance > 0 and no qualifying stock movements for >= 60 days relative to ${filters.date}`}
              icon={<Clock className="w-4 h-4 text-rose-600" />}
              accentColor="border-l-rose-500"
              badge={
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                  {dashboardData.nonMovingItems.length} ITEMS DETECTED
                </span>
              }
            >
              <NonMovingNeedleSection
                items={dashboardData.nonMovingItems}
                floorSummary={dashboardData.nonMovingByFloor}
                selectedDate={filters.date}
              />
            </DashboardSection>
          </div>
        </div>
      ) : null}
    </div>
  )
}
