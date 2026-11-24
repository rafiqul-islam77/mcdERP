'use client'

import * as React from 'react'
import {
  BarChart3,
  PieChart,
  Clock,
  AlertCircle,
  TrendingUp,
  Boxes,
  Activity,
  PackageCheck,
  ShieldAlert,
} from 'lucide-react'
import type { DailyEntryCategory, Floor } from '@/types'
import type {
  DashboardData,
  DashboardFilters,
  DashboardGroupKey,
  NormalSubCategoryFilter,
} from '@/lib/dashboard/dashboard-types'
import { getDashboardDataAction } from '@/app/actions/dashboard'
import { DashboardFiltersBar } from './dashboard-filters'
import {
  FacilityOverviewStrip,
  NormalKPICards,
  IdleKPICards,
} from './dashboard-kpi-cards'
import { DashboardSkeleton } from './dashboard-skeleton'
import { DashboardSection } from './dashboard-section'
import { FloorReceiveDeliveryChart } from './floor-receive-delivery-chart'
import { ReceiveDeliveryPieChart } from './receive-delivery-donut'
import { FloorStockChart, TotalFloorStockCard } from './floor-stock-chart'
import { MonthlyStockChart, TotalMonthlyStockSummaryCard } from './monthly-stock-chart'
import { MonthlyMovementAreaChart } from './monthly-movement-area-chart'
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
  const [initYear, initMonth] = React.useMemo(() => {
    const parts = (initialDate || new Date().toISOString().slice(0, 10)).split('-')
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)]
  }, [initialDate])

  // Determine authorized groups
  const hasRunningAccess = allowedCategories.includes('RUNNING')
  const hasNewAccess = allowedCategories.includes('NEW')
  const hasNormalAccess = hasRunningAccess || hasNewAccess
  const hasIdleAccess = allowedCategories.includes('IDLE')

  // Default to NORMAL Needle if authorized, else IDLE
  const [activeGroup, setActiveGroup] = React.useState<DashboardGroupKey>(() =>
    hasNormalAccess ? 'NORMAL' : 'IDLE'
  )

  const [normalSubCategory, setNormalSubCategory] =
    React.useState<NormalSubCategoryFilter>(() => {
      if (hasRunningAccess && hasNewAccess) return 'ALL_NORMAL'
      if (hasRunningAccess) return 'RUNNING'
      return 'NEW'
    })

  // Note: category remains 'ALL' in server request so switching tabs or Normal sub-filters
  // never triggers unnecessary full database reloads.
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

  // Fetch when date, floorId, month, or year change
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

  // Normal category visibility flags (strictly respecting role permissions & client sub-filter)
  const showRunning =
    hasRunningAccess &&
    (normalSubCategory === 'ALL_NORMAL' || normalSubCategory === 'RUNNING')
  const showNew =
    hasNewAccess &&
    (normalSubCategory === 'ALL_NORMAL' || normalSubCategory === 'NEW')

  return (
    <div className="space-y-5">
      {/* ── 1. Top Filters Bar + Group Navigation Tabs ── */}
      <DashboardFiltersBar
        filters={filters}
        onChange={handleFilterChange}
        activeGroup={activeGroup}
        onGroupChange={setActiveGroup}
        normalSubCategory={normalSubCategory}
        onNormalSubCategoryChange={setNormalSubCategory}
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

      {/* Unauthorized Fallback if user has no needle category permissions */}
      {!hasNormalAccess && !hasIdleAccess ? (
        <div className="bg-white border border-surface-border rounded-erp-lg p-10 text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="text-sm font-bold text-ink">No Needle Categories Authorized</h2>
          <p className="text-xs text-ink-muted">
            Your account does not currently hold permissions to view Normal or Idle needle inventory.
          </p>
        </div>
      ) : loading && !dashboardData ? (
        <DashboardSkeleton />
      ) : dashboardData ? (
        <div className="space-y-5">
          {/* ── 2. Non-Duplicated Facility Overview Strip ── */}
          <FacilityOverviewStrip facilityKpis={dashboardData.facilityKpis} />

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* GROUP 1: NORMAL NEEDLE DASHBOARD (RUNNING + NEW)                  */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeGroup === 'NORMAL' && hasNormalAccess && (
            <div className="space-y-5" role="tabpanel" aria-label="Normal Needle Dashboard">
              {/* Group Identity Header Strip */}
              <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-erp-lg px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                    NORMAL NEEDLE DASHBOARD
                  </span>
                  <span className="text-[11px] text-blue-100 hidden sm:inline">
                    • Regular &amp; New Needle Stock &amp; Transactions (Excludes Idle)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  {showRunning && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white">
                      REGULAR
                    </span>
                  )}
                  {showNew && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white">
                      NEW
                    </span>
                  )}
                </div>
              </div>

              {/* Normal KPI Cards */}
              <NormalKPICards
                kpis={dashboardData.normal.kpis}
                selectedDate={filters.date}
                selectedMonthLabel={selectedMonthLabel}
                showRunning={showRunning}
                showNew={showNew}
              />

              {/* DAILY FLOOR-WISE RECEIVE & DELIVERY — RUNNING */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="TODAY FLOOR-WISE RECEIVE & DELIVERY (REGULAR NEEDLE)"
                      subtitle={`Grouped bar comparison for ${filters.date}`}
                      icon={<BarChart3 className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                      badge={
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase">
                          REGULAR
                        </span>
                      }
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.dailyActivity.RUNNING.items}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL RECEIVE & DELIVERY — REGULAR"
                      subtitle="Activity mix (Pie Chart)"
                      icon={<PieChart className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.dailyActivity.RUNNING.totalReceived}
                        totalDelivery={dashboardData.normal.dailyActivity.RUNNING.totalDelivery}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* DAILY FLOOR-WISE RECEIVE & DELIVERY — NEW */}
              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="TODAY FLOOR-WISE RECEIVE & DELIVERY (NEW NEEDLE)"
                      subtitle={`Grouped bar comparison for ${filters.date}`}
                      icon={<BarChart3 className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                      badge={
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase">
                          NEW NEEDLE
                        </span>
                      }
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.dailyActivity.NEW.items}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL RECEIVE & DELIVERY — NEW"
                      subtitle="Activity mix (Pie Chart)"
                      icon={<PieChart className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.dailyActivity.NEW.totalReceived}
                        totalDelivery={dashboardData.normal.dailyActivity.NEW.totalDelivery}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* MONTHLY FLOOR-WISE RECEIVE & DELIVERY — RUNNING */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (REGULAR NEEDLE)"
                      subtitle={`Monthly totals for ${selectedMonthLabel}`}
                      icon={<BarChart3 className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                      badge={
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase">
                          MONTHLY REGULAR
                        </span>
                      }
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.monthlyActivity.RUNNING.items}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL MONTHLY RECEIVE & DELIVERY — REGULAR"
                      subtitle={`${selectedMonthLabel} (Pie Chart)`}
                      icon={<PieChart className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.monthlyActivity.RUNNING.totalReceived}
                        totalDelivery={dashboardData.normal.monthlyActivity.RUNNING.totalDelivery}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* MONTHLY FLOOR-WISE RECEIVE & DELIVERY — NEW */}
              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (NEW NEEDLE)"
                      subtitle={`Monthly totals for ${selectedMonthLabel}`}
                      icon={<BarChart3 className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                      badge={
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase">
                          MONTHLY NEW
                        </span>
                      }
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.monthlyActivity.NEW.items}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL MONTHLY RECEIVE & DELIVERY — NEW"
                      subtitle={`${selectedMonthLabel} (Pie Chart)`}
                      icon={<PieChart className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.monthlyActivity.NEW.totalReceived}
                        totalDelivery={dashboardData.normal.monthlyActivity.NEW.totalDelivery}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* FLOOR-WISE STOCK QTY — RUNNING */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="FLOOR-WISE STOCK QTY (REGULAR)"
                      subtitle={`Closing balance as of ${filters.date}`}
                      icon={<Boxes className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                    >
                      <FloorStockChart
                        items={dashboardData.normal.floorStock.RUNNING.items}
                        color="#2563EB"
                        categoryLabel="Regular Needle"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL FLOOR-WISE STOCK QTY (PCS)"
                      subtitle="Regular stock summary"
                      accentColor="border-l-blue-600"
                    >
                      <TotalFloorStockCard
                        totalStock={dashboardData.normal.floorStock.RUNNING.totalStock}
                        floorCount={dashboardData.normal.floorStock.RUNNING.items.length}
                        categoryLabel="Regular Needle"
                        color="text-blue-600"
                        bgColor="bg-blue-50/60"
                        borderColor="border-blue-200"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* FLOOR-WISE STOCK QTY — NEW */}
              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="FLOOR-WISE STOCK QTY (NEW)"
                      subtitle={`Closing balance as of ${filters.date}`}
                      icon={<Boxes className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                    >
                      <FloorStockChart
                        items={dashboardData.normal.floorStock.NEW.items}
                        color="#8B5CF6"
                        categoryLabel="New Needle"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL FLOOR-WISE STOCK QTY (PCS)"
                      subtitle="New needle stock summary"
                      accentColor="border-l-purple-600"
                    >
                      <TotalFloorStockCard
                        totalStock={dashboardData.normal.floorStock.NEW.totalStock}
                        floorCount={dashboardData.normal.floorStock.NEW.items.length}
                        categoryLabel="New Needle"
                        color="text-purple-600"
                        bgColor="bg-purple-50/60"
                        borderColor="border-purple-200"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* MONTH-WISE STOCK QTY — RUNNING (LINE GRAPH) */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH-WISE STOCK QTY (REGULAR)"
                      subtitle="12-Month closing stock balance trend (Line Graph)"
                      icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                    >
                      <MonthlyStockChart
                        trendPoints={dashboardData.monthlyStockTrend}
                        dataKey="runningStock"
                        color="#2563EB"
                        categoryLabel="Regular Needle"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL MONTH-WISE STOCK QTY (PCS)"
                      subtitle="Latest month closing"
                      accentColor="border-l-blue-600"
                    >
                      <TotalMonthlyStockSummaryCard
                        trendPoints={dashboardData.monthlyStockTrend}
                        dataKey="runningStock"
                        categoryLabel="Regular Needle"
                        color="text-blue-600"
                        bgColor="bg-blue-50/60"
                        borderColor="border-blue-200"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* MONTH-WISE STOCK QTY — NEW (LINE GRAPH) */}
              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH-WISE STOCK QTY (NEW)"
                      subtitle="12-Month closing stock balance trend (Line Graph)"
                      icon={<TrendingUp className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                    >
                      <MonthlyStockChart
                        trendPoints={dashboardData.monthlyStockTrend}
                        dataKey="newStock"
                        color="#8B5CF6"
                        categoryLabel="New Needle"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL MONTH-WISE STOCK QTY (PCS)"
                      subtitle="Latest month closing"
                      accentColor="border-l-purple-600"
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

              {/* COMBINED NORMAL MONTH-WISE STOCK QTY (STACKED BAR — RUNNING + NEW ONLY) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="TOTAL NORMAL MONTH-WISE STOCK QTY"
                    subtitle="Stacked comparison of Regular + New closing stock (Excludes Idle)"
                    icon={<BarChart3 className="w-4 h-4 text-indigo-600" />}
                    accentColor="border-l-indigo-600"
                  >
                    <TotalMonthlyStockChart
                      trendPoints={dashboardData.monthlyStockTrend}
                      authorizedCategories={allowedCategories}
                      showRunning={showRunning}
                      showNew={showNew}
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL NORMAL MONTH-WISE STOCK (PCS)"
                    subtitle="Regular + New combined"
                    accentColor="border-l-indigo-600"
                  >
                    <TotalMonthlyCombinedSummaryCard
                      trendPoints={dashboardData.monthlyStockTrend}
                      authorizedCategories={allowedCategories}
                      showRunning={showRunning}
                      showNew={showNew}
                    />
                  </DashboardSection>
                </div>
              </div>

              {/* NORMAL MONTHLY MOVEMENT TREND (AREA GRAPH) + STOCK DISTRIBUTION (DONUT CHART) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DashboardSection
                  title="NORMAL MONTHLY MOVEMENT TREND"
                  subtitle="12-Month Receive vs Delivered flow (Area Graph)"
                  icon={<Activity className="w-4 h-4 text-emerald-600" />}
                  accentColor="border-l-emerald-500"
                >
                  <MonthlyMovementAreaChart
                    trendPoints={dashboardData.monthlyStockTrend}
                    mode="NORMAL"
                    normalSubCategory={normalSubCategory}
                  />
                </DashboardSection>

                <DashboardSection
                  title="NORMAL STOCK DISTRIBUTION (REGULAR VS NEW)"
                  subtitle={`Inventory mix as of ${filters.date} (Donut Chart)`}
                  icon={<PieChart className="w-4 h-4 text-indigo-600" />}
                  accentColor="border-l-indigo-500"
                >
                  <StockDistributionChart
                    items={dashboardData.normal.stockDistribution}
                    centerLabel="Normal Stock"
                  />
                </DashboardSection>
              </div>

              {/* NORMAL NON-MOVING ITEMS — 02 MONTH */}
              <DashboardSection
                title="NORMAL NEEDLE — FLOOR-WISE NOT MOVING ITEM (02 MONTH)"
                subtitle={`Normal Needle items with balance > 0 and no qualifying movement for >= 60 days as of ${filters.date}`}
                icon={<Clock className="w-4 h-4 text-rose-600" />}
                accentColor="border-l-rose-500"
                badge={
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    {dashboardData.normal.nonMovingItems.length} NORMAL ITEMS
                  </span>
                }
              >
                <NonMovingNeedleSection
                  items={dashboardData.normal.nonMovingItems}
                  floorSummary={dashboardData.normal.nonMovingByFloor}
                  group="NORMAL"
                  showRunning={showRunning}
                  showNew={showNew}
                />
              </DashboardSection>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* GROUP 2: IDLE NEEDLE DASHBOARD (IDLE ONLY)                        */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeGroup === 'IDLE' && hasIdleAccess && (
            <div className="space-y-5" role="tabpanel" aria-label="Idle Needle Dashboard">
              {/* Group Identity Header Strip */}
              <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-teal-600 text-white rounded-erp-lg px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                    IDLE NEEDLE DASHBOARD
                  </span>
                  <span className="text-[11px] text-amber-50 hidden sm:inline">
                    • Independent Idle Needle Stock, Transactions &amp; Floor Analytics
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white uppercase">
                  IDLE NEEDLE ONLY
                </span>
              </div>

              {/* Idle KPI Cards */}
              <IdleKPICards
                kpis={dashboardData.idle.kpis}
                selectedDate={filters.date}
                selectedMonthLabel={selectedMonthLabel}
              />

              {/* DAILY FLOOR-WISE RECEIVE & DELIVERY — IDLE */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="TODAY FLOOR-WISE RECEIVE & DELIVERY (IDLE NEEDLE)"
                    subtitle={`Grouped bar comparison for ${filters.date}`}
                    icon={<BarChart3 className="w-4 h-4 text-teal-600" />}
                    accentColor="border-l-teal-600"
                    badge={
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase">
                        IDLE NEEDLE
                      </span>
                    }
                  >
                    <FloorReceiveDeliveryChart
                      items={dashboardData.idle.dailyActivity.items}
                      receivedColor="#0D9488"
                      deliveryColor="#F97316"
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL RECEIVE & DELIVERY — IDLE"
                    subtitle="Activity mix (Pie Chart)"
                    icon={<PieChart className="w-4 h-4 text-amber-600" />}
                    accentColor="border-l-amber-500"
                  >
                    <ReceiveDeliveryPieChart
                      totalReceived={dashboardData.idle.dailyActivity.totalReceived}
                      totalDelivery={dashboardData.idle.dailyActivity.totalDelivery}
                      receivedColor="#0D9488"
                      deliveryColor="#F97316"
                    />
                  </DashboardSection>
                </div>
              </div>

              {/* MONTHLY FLOOR-WISE RECEIVE & DELIVERY — IDLE */}
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
                      items={dashboardData.idle.monthlyActivity.items}
                      receivedColor="#0D9488"
                      deliveryColor="#F97316"
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL MONTHLY RECEIVE & DELIVERY — IDLE"
                    subtitle={`${selectedMonthLabel} (Pie Chart)`}
                    icon={<PieChart className="w-4 h-4 text-amber-600" />}
                    accentColor="border-l-amber-500"
                  >
                    <ReceiveDeliveryPieChart
                      totalReceived={dashboardData.idle.monthlyActivity.totalReceived}
                      totalDelivery={dashboardData.idle.monthlyActivity.totalDelivery}
                      receivedColor="#0D9488"
                      deliveryColor="#F97316"
                    />
                  </DashboardSection>
                </div>
              </div>

              {/* FLOOR-WISE IDLE STOCK QTY */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="FLOOR-WISE STOCK QTY (IDLE)"
                    subtitle={`Closing balance as of ${filters.date}`}
                    icon={<Boxes className="w-4 h-4 text-teal-600" />}
                    accentColor="border-l-teal-600"
                  >
                    <FloorStockChart
                      items={dashboardData.idle.floorStock.items}
                      color="#0D9488"
                      categoryLabel="Idle Needle"
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL FLOOR-WISE IDLE STOCK (PCS)"
                    subtitle="Idle stock summary"
                    accentColor="border-l-teal-600"
                  >
                    <TotalFloorStockCard
                      totalStock={dashboardData.idle.floorStock.totalStock}
                      floorCount={dashboardData.idle.floorStock.items.length}
                      categoryLabel="Idle Needle"
                      color="text-teal-600"
                      bgColor="bg-teal-50/60"
                      borderColor="border-teal-200"
                    />
                  </DashboardSection>
                </div>
              </div>

              {/* MONTH-WISE IDLE STOCK QTY (LINE GRAPH) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="MONTH-WISE STOCK QTY (IDLE)"
                    subtitle="12-Month Idle closing stock trend (Line Graph)"
                    icon={<TrendingUp className="w-4 h-4 text-orange-600" />}
                    accentColor="border-l-orange-500"
                  >
                    <MonthlyStockChart
                      trendPoints={dashboardData.monthlyStockTrend}
                      dataKey="idleStock"
                      color="#F97316"
                      categoryLabel="Idle Needle"
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL IDLE MONTH-WISE STOCK (PCS)"
                    subtitle="Latest month closing"
                    accentColor="border-l-orange-500"
                  >
                    <TotalMonthlyStockSummaryCard
                      trendPoints={dashboardData.monthlyStockTrend}
                      dataKey="idleStock"
                      categoryLabel="Idle Needle"
                      color="text-orange-600"
                      bgColor="bg-orange-50/60"
                      borderColor="border-orange-200"
                    />
                  </DashboardSection>
                </div>
              </div>

              {/* IDLE MONTHLY MOVEMENT TREND (AREA GRAPH) + IDLE FLOOR STOCK DISTRIBUTION (DONUT CHART) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DashboardSection
                  title="IDLE MONTHLY MOVEMENT TREND"
                  subtitle="12-Month Idle Receive vs Delivered flow (Area Graph)"
                  icon={<Activity className="w-4 h-4 text-teal-600" />}
                  accentColor="border-l-teal-500"
                >
                  <MonthlyMovementAreaChart
                    trendPoints={dashboardData.monthlyStockTrend}
                    mode="IDLE"
                  />
                </DashboardSection>

                <DashboardSection
                  title="IDLE STOCK DISTRIBUTION BY FLOOR"
                  subtitle={`Floor share of Idle inventory as of ${filters.date} (Donut Chart)`}
                  icon={<PieChart className="w-4 h-4 text-amber-600" />}
                  accentColor="border-l-amber-500"
                >
                  <StockDistributionChart
                    items={dashboardData.idle.stockDistributionByFloor}
                    centerLabel="Idle Stock"
                    emptyMessage="No positive Idle stock across authorized floors"
                  />
                </DashboardSection>
              </div>

              {/* IDLE NON-MOVING ITEMS — 02 MONTH */}
              <DashboardSection
                title="IDLE NEEDLE — FLOOR-WISE NOT MOVING ITEM (02 MONTH)"
                subtitle={`Idle Needle items with balance > 0 and no qualifying movement for >= 60 days as of ${filters.date}`}
                icon={<Clock className="w-4 h-4 text-amber-600" />}
                accentColor="border-l-amber-500"
                badge={
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    {dashboardData.idle.nonMovingItems.length} IDLE ITEMS
                  </span>
                }
              >
                <NonMovingNeedleSection
                  items={dashboardData.idle.nonMovingItems}
                  floorSummary={dashboardData.idle.nonMovingByFloor}
                  group="IDLE"
                />
              </DashboardSection>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
