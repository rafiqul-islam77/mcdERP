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
  Disc,
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
import { MonthlyMovementComboChart } from './monthly-movement-combo-chart'
import {
  TotalMonthlyStockChart,
  TotalMonthlyCombinedSummaryCard,
} from './total-monthly-stock-chart'
import { StockDistributionChart } from './stock-distribution-chart'
import { StockRadialChart } from './stock-radial-chart'
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

  const hasRunningAccess = allowedCategories.includes('RUNNING')
  const hasNewAccess = allowedCategories.includes('NEW')
  const hasNormalAccess = hasRunningAccess || hasNewAccess
  const hasIdleAccess = allowedCategories.includes('IDLE')

  const [activeGroup, setActiveGroup] = React.useState<DashboardGroupKey>(() =>
    hasNormalAccess ? 'NORMAL' : 'IDLE'
  )

  const [normalSubCategory, setNormalSubCategory] =
    React.useState<NormalSubCategoryFilter>(() => {
      if (hasRunningAccess && hasNewAccess) return 'ALL_NORMAL'
      if (hasRunningAccess) return 'RUNNING'
      return 'NEW'
    })

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

  React.useEffect(() => {
    loadDashboard(filters)
  }, [loadDashboard, filters])

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

  const showRunning =
    hasRunningAccess &&
    (normalSubCategory === 'ALL_NORMAL' || normalSubCategory === 'RUNNING')
  const showNew =
    hasNewAccess &&
    (normalSubCategory === 'ALL_NORMAL' || normalSubCategory === 'NEW')

  const normalRadialFloorItems = React.useMemo(() => {
    if (!dashboardData) return []
    if (normalSubCategory === 'RUNNING') return dashboardData.normal.floorStock.RUNNING.items
    if (normalSubCategory === 'NEW') return dashboardData.normal.floorStock.NEW.items
    return dashboardData.normal.floorStock.combined.items
  }, [dashboardData, normalSubCategory])

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
              <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-erp-lg px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                    NORMAL NEEDLE DASHBOARD
                  </span>
                  <span className="text-[11px] text-blue-100 hidden sm:inline">
                    • Running (Regular) &amp; New Needle Stock &amp; Transactions (Excludes Idle)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  {showRunning && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white">
                      RUNNING
                    </span>
                  )}
                  {showNew && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white">
                      NEW
                    </span>
                  )}
                </div>
              </div>

              <NormalKPICards
                kpis={dashboardData.normal.kpis}
                selectedDate={filters.date}
                selectedMonthLabel={selectedMonthLabel}
                showRunning={showRunning}
                showNew={showNew}
              />

              {/* 1. TODAY — REGULAR */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="TODAY FLOOR-WISE RECEIVE & DELIVERY (REGULAR NEEDLE)"
                      subtitle={`Floor-wise transactions • ${filters.date}`}
                      icon={<BarChart3 className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                      headerTone="blue"
                      containerVariant="default"
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.dailyActivity.RUNNING.items}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                        orientation="vertical"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL RECEIVE & DELIVERY — REGULAR"
                      subtitle="Activity comparison"
                      icon={<PieChart className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-cyan-500"
                      headerTone="light"
                      containerVariant="soft-blue"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.dailyActivity.RUNNING.totalReceived}
                        totalDelivery={dashboardData.normal.dailyActivity.RUNNING.totalDelivery}
                        receivedColor="#10B981"
                        deliveryColor="#2563EB"
                        chartType="donut"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* 2. TODAY — NEW */}
              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="TODAY FLOOR-WISE RECEIVE & DELIVERY (NEW NEEDLE)"
                      subtitle={`Floor-wise transactions • ${filters.date}`}
                      icon={<BarChart3 className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                      headerTone="purple"
                      containerVariant="soft-purple"
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.dailyActivity.NEW.items}
                        receivedColor="#8B5CF6"
                        deliveryColor="#EC4899"
                        orientation="horizontal"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL RECEIVE & DELIVERY — NEW"
                      subtitle="Activity comparison"
                      icon={<PieChart className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                      headerTone="light"
                      containerVariant="default"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.dailyActivity.NEW.totalReceived}
                        totalDelivery={dashboardData.normal.dailyActivity.NEW.totalDelivery}
                        receivedColor="#8B5CF6"
                        deliveryColor="#EC4899"
                        chartType="donut"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* 3. MONTHLY — REGULAR */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (REGULAR NEEDLE)"
                      subtitle={`Monthly totals • ${selectedMonthLabel}`}
                      icon={<BarChart3 className="w-4 h-4 text-indigo-600" />}
                      accentColor="border-l-indigo-600"
                      headerTone="indigo"
                      containerVariant="soft-blue"
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.monthlyActivity.RUNNING.items}
                        receivedColor="#06B6D4"
                        receivedGradientTo="#0891B2"
                        deliveryColor="#4F46E5"
                        deliveryGradientTo="#3730A3"
                        orientation="vertical"
                        useGradient={true}
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL MONTHLY RECEIVE & DELIVERY — REGULAR"
                      subtitle={selectedMonthLabel}
                      icon={<PieChart className="w-4 h-4 text-indigo-600" />}
                      accentColor="border-l-indigo-600"
                      headerTone="light"
                      containerVariant="default"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.monthlyActivity.RUNNING.totalReceived}
                        totalDelivery={dashboardData.normal.monthlyActivity.RUNNING.totalDelivery}
                        receivedColor="#06B6D4"
                        deliveryColor="#4F46E5"
                        chartType="pie"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* 4. MONTHLY — NEW */}
              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (NEW NEEDLE)"
                      subtitle={`Monthly totals • ${selectedMonthLabel}`}
                      icon={<BarChart3 className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                      headerTone="purple"
                      containerVariant="default"
                    >
                      <FloorReceiveDeliveryChart
                        items={dashboardData.normal.monthlyActivity.NEW.items}
                        receivedColor="#F59E0B"
                        receivedGradientTo="#D97706"
                        deliveryColor="#7C3AED"
                        deliveryGradientTo="#5B21B6"
                        orientation="horizontal"
                        useGradient={true}
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL MONTHLY RECEIVE & DELIVERY — NEW"
                      subtitle={selectedMonthLabel}
                      icon={<PieChart className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-amber-500"
                      headerTone="light"
                      containerVariant="soft-purple"
                    >
                      <ReceiveDeliveryPieChart
                        totalReceived={dashboardData.normal.monthlyActivity.NEW.totalReceived}
                        totalDelivery={dashboardData.normal.monthlyActivity.NEW.totalDelivery}
                        receivedColor="#F59E0B"
                        deliveryColor="#7C3AED"
                        chartType="pie"
                      />
                    </DashboardSection>
                  </div>
                </div>
              )}

              {/* 5. FLOOR-WISE STOCK — REGULAR & NEW */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="FLOOR-WISE STOCK QTY (REGULAR)"
                      subtitle={`Closing stock by floor • ${filters.date}`}
                      icon={<Boxes className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                      headerTone="blue"
                      containerVariant="soft-blue"
                    >
                      <FloorStockChart
                        items={dashboardData.normal.floorStock.RUNNING.items}
                        color="#2563EB"
                        gradientToColor="#06B6D4"
                        orientation="horizontal"
                        useGradient={true}
                        categoryLabel="Running Needle"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL FLOOR-WISE STOCK QTY (PCS)"
                      subtitle="Regular stock summary"
                      accentColor="border-l-blue-600"
                      headerTone="light"
                      containerVariant="default"
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

              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="FLOOR-WISE STOCK QTY (NEW)"
                      subtitle={`Closing stock by floor • ${filters.date}`}
                      icon={<Boxes className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                      headerTone="purple"
                      containerVariant="soft-purple"
                    >
                      <FloorStockChart
                        items={dashboardData.normal.floorStock.NEW.items}
                        color="#8B5CF6"
                        gradientToColor="#EC4899"
                        orientation="vertical"
                        useGradient={true}
                        categoryLabel="New Needle"
                      />
                    </DashboardSection>
                  </div>

                  <div>
                    <DashboardSection
                      title="TOTAL FLOOR-WISE STOCK QTY (PCS)"
                      subtitle="New needle stock summary"
                      accentColor="border-l-purple-600"
                      headerTone="light"
                      containerVariant="default"
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

              {/* 6. MONTH-WISE STOCK — REGULAR & NEW */}
              {showRunning && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH-WISE STOCK QTY (REGULAR)"
                      subtitle="12-Month closing stock balance trend"
                      icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
                      accentColor="border-l-blue-600"
                      headerTone="blue"
                      containerVariant="default"
                    >
                      <MonthlyStockChart
                        trendPoints={dashboardData.monthlyStockTrend}
                        dataKey="runningStock"
                        chartType="line"
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
                      headerTone="light"
                      containerVariant="soft-blue"
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

              {showNew && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <DashboardSection
                      title="MONTH-WISE STOCK QTY (NEW)"
                      subtitle="12-Month closing stock balance trend"
                      icon={<TrendingUp className="w-4 h-4 text-purple-600" />}
                      accentColor="border-l-purple-600"
                      headerTone="purple"
                      containerVariant="soft-purple"
                    >
                      <MonthlyStockChart
                        trendPoints={dashboardData.monthlyStockTrend}
                        dataKey="newStock"
                        chartType="area"
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
                      headerTone="light"
                      containerVariant="default"
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

              {/* 7. COMBINED NORMAL MONTH-WISE STOCK */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="TOTAL NORMAL MONTH-WISE STOCK QTY"
                    subtitle="Combined Regular + New closing stock (Excludes Idle)"
                    icon={<BarChart3 className="w-4 h-4 text-indigo-600" />}
                    accentColor="border-l-indigo-600"
                    headerTone="indigo"
                    containerVariant="neutral"
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
                    headerTone="light"
                    containerVariant="default"
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

              {/* 8. NORMAL MONTHLY MOVEMENT & CLOSING STOCK */}
              <DashboardSection
                title="NORMAL MONTHLY MOVEMENT & CLOSING STOCK"
                subtitle="Monthly Received & Delivered vs. Closing Stock balance"
                icon={<Activity className="w-4 h-4 text-emerald-600" />}
                accentColor="border-l-emerald-500"
                headerTone="emerald"
                containerVariant="soft-green"
              >
                <MonthlyMovementComboChart
                  trendPoints={dashboardData.monthlyStockTrend}
                  mode="NORMAL"
                  normalSubCategory={normalSubCategory}
                />
              </DashboardSection>

              {/* 9. NORMAL STOCK DISTRIBUTION + TOP FLOORS NORMAL STOCK */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DashboardSection
                  title="NORMAL STOCK DISTRIBUTION (REGULAR VS NEW)"
                  subtitle={`Inventory mix as of ${filters.date}`}
                  icon={<PieChart className="w-4 h-4 text-indigo-600" />}
                  accentColor="border-l-indigo-500"
                  headerTone="indigo"
                  containerVariant="default"
                >
                  <StockDistributionChart
                    items={dashboardData.normal.stockDistribution}
                    centerLabel="Normal Stock"
                  />
                </DashboardSection>

                <DashboardSection
                  title="TOP FLOORS NORMAL STOCK"
                  subtitle={`Stock share across authorized floors (${filters.date})`}
                  icon={<Disc className="w-4 h-4 text-cyan-600" />}
                  accentColor="border-l-cyan-500"
                  headerTone="blue"
                  containerVariant="soft-blue"
                >
                  <StockRadialChart items={normalRadialFloorItems} />
                </DashboardSection>
              </div>

              {/* 10. NORMAL NON-MOVING ITEMS */}
              <DashboardSection
                title="NORMAL NEEDLE — FLOOR-WISE NOT MOVING ITEM (02 MONTH)"
                subtitle={`Items with stock > 0 and no qualifying movement for >= 60 days as of ${filters.date}`}
                icon={<Clock className="w-4 h-4 text-rose-600" />}
                accentColor="border-l-rose-500"
                headerTone="rose"
                containerVariant="default"
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

              <IdleKPICards
                kpis={dashboardData.idle.kpis}
                selectedDate={filters.date}
                selectedMonthLabel={selectedMonthLabel}
              />

              {/* 1. IDLE TODAY */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="TODAY FLOOR-WISE RECEIVE & DELIVERY (IDLE NEEDLE)"
                    subtitle={`Floor-wise transactions • ${filters.date}`}
                    icon={<BarChart3 className="w-4 h-4 text-teal-600" />}
                    accentColor="border-l-teal-600"
                    headerTone="teal"
                    containerVariant="soft-teal"
                    badge={
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-600 text-white uppercase">
                        IDLE NEEDLE
                      </span>
                    }
                  >
                    <FloorReceiveDeliveryChart
                      items={dashboardData.idle.dailyActivity.items}
                      receivedColor="#0D9488"
                      deliveryColor="#F97316"
                      orientation="vertical"
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL RECEIVE & DELIVERY — IDLE"
                    subtitle="Activity comparison"
                    icon={<PieChart className="w-4 h-4 text-amber-600" />}
                    accentColor="border-l-amber-500"
                    headerTone="light"
                    containerVariant="default"
                  >
                    <ReceiveDeliveryPieChart
                      totalReceived={dashboardData.idle.dailyActivity.totalReceived}
                      totalDelivery={dashboardData.idle.dailyActivity.totalDelivery}
                      receivedColor="#0D9488"
                      deliveryColor="#F97316"
                      chartType="donut"
                    />
                  </DashboardSection>
                </div>
              </div>

              {/* 2. IDLE MONTHLY */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="MONTH & FLOOR-WISE RECEIVE & DELIVERY (IDLE NEEDLE)"
                    subtitle={`Monthly totals • ${selectedMonthLabel}`}
                    icon={<BarChart3 className="w-4 h-4 text-amber-600" />}
                    accentColor="border-l-amber-500"
                    headerTone="amber"
                    containerVariant="soft-amber"
                    badge={
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-600 text-white uppercase">
                        MONTHLY IDLE
                      </span>
                    }
                  >
                    <FloorReceiveDeliveryChart
                      items={dashboardData.idle.monthlyActivity.items}
                      receivedColor="#14B8A6"
                      receivedGradientTo="#0F766E"
                      deliveryColor="#F59E0B"
                      deliveryGradientTo="#EA580C"
                      orientation="horizontal"
                      useGradient={true}
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL MONTHLY RECEIVE & DELIVERY — IDLE"
                    subtitle={selectedMonthLabel}
                    icon={<PieChart className="w-4 h-4 text-amber-600" />}
                    accentColor="border-l-amber-500"
                    headerTone="light"
                    containerVariant="default"
                  >
                    <ReceiveDeliveryPieChart
                      totalReceived={dashboardData.idle.monthlyActivity.totalReceived}
                      totalDelivery={dashboardData.idle.monthlyActivity.totalDelivery}
                      receivedColor="#14B8A6"
                      deliveryColor="#F59E0B"
                      chartType="pie"
                    />
                  </DashboardSection>
                </div>
              </div>

              {/* 3. IDLE FLOOR-WISE STOCK */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="FLOOR-WISE STOCK QTY (IDLE)"
                    subtitle={`Closing stock by floor • ${filters.date}`}
                    icon={<Boxes className="w-4 h-4 text-teal-600" />}
                    accentColor="border-l-teal-600"
                    headerTone="teal"
                    containerVariant="soft-teal"
                  >
                    <FloorStockChart
                      items={dashboardData.idle.floorStock.items}
                      color="#0D9488"
                      gradientToColor="#06B6D4"
                      orientation="vertical"
                      useGradient={true}
                      categoryLabel="Idle Needle"
                    />
                  </DashboardSection>
                </div>

                <div>
                  <DashboardSection
                    title="TOTAL FLOOR-WISE IDLE STOCK (PCS)"
                    subtitle="Idle stock summary"
                    accentColor="border-l-teal-600"
                    headerTone="light"
                    containerVariant="default"
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

              {/* 4. IDLE MONTH-WISE STOCK */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <DashboardSection
                    title="MONTH-WISE STOCK QTY (IDLE)"
                    subtitle="12-Month Idle closing stock trend"
                    icon={<TrendingUp className="w-4 h-4 text-orange-600" />}
                    accentColor="border-l-orange-500"
                    headerTone="amber"
                    containerVariant="soft-amber"
                  >
                    <MonthlyStockChart
                      trendPoints={dashboardData.monthlyStockTrend}
                      dataKey="idleStock"
                      chartType="area"
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
                    headerTone="light"
                    containerVariant="default"
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

              {/* 5. IDLE MONTHLY MOVEMENT & CLOSING STOCK */}
              <DashboardSection
                title="IDLE MONTHLY MOVEMENT & CLOSING STOCK"
                subtitle="Monthly Idle Received & Delivered vs. Closing Stock balance"
                icon={<Activity className="w-4 h-4 text-teal-600" />}
                accentColor="border-l-teal-500"
                headerTone="teal"
                containerVariant="neutral"
              >
                <MonthlyMovementComboChart
                  trendPoints={dashboardData.monthlyStockTrend}
                  mode="IDLE"
                />
              </DashboardSection>

              {/* 6. IDLE FLOOR DISTRIBUTION + TOP FLOORS IDLE STOCK */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DashboardSection
                  title="IDLE STOCK DISTRIBUTION BY FLOOR"
                  subtitle={`Floor share of Idle inventory as of ${filters.date}`}
                  icon={<PieChart className="w-4 h-4 text-amber-600" />}
                  accentColor="border-l-amber-500"
                  headerTone="amber"
                  containerVariant="default"
                >
                  <StockDistributionChart
                    items={dashboardData.idle.stockDistributionByFloor}
                    centerLabel="Idle Stock"
                    emptyMessage="No positive Idle stock across authorized floors"
                  />
                </DashboardSection>

                <DashboardSection
                  title="TOP FLOORS IDLE STOCK"
                  subtitle={`Stock share across authorized floors (${filters.date})`}
                  icon={<Disc className="w-4 h-4 text-teal-600" />}
                  accentColor="border-l-teal-500"
                  headerTone="teal"
                  containerVariant="soft-teal"
                >
                  <StockRadialChart
                    items={dashboardData.idle.floorStock.items}
                    palette={['#0D9488', '#14B8A6', '#F97316', '#F59E0B', '#06B6D4', '#EA580C']}
                    emptyMessage="No positive Idle floor stock available"
                  />
                </DashboardSection>
              </div>

              {/* 7. IDLE NON-MOVING ITEMS */}
              <DashboardSection
                title="IDLE NEEDLE — FLOOR-WISE NOT MOVING ITEM (02 MONTH)"
                subtitle={`Items with stock > 0 and no qualifying movement for >= 60 days as of ${filters.date}`}
                icon={<Clock className="w-4 h-4 text-amber-600" />}
                accentColor="border-l-amber-500"
                headerTone="amber"
                containerVariant="default"
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
