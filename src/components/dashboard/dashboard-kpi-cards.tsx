import * as React from 'react'
import {
  Store,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarArrowDown,
  CalendarArrowUp,
  Boxes,
  Layers,
  MapPin,
} from 'lucide-react'
import type {
  FacilityKPIData,
  IdleKPIData,
  NormalKPIData,
} from '@/lib/dashboard/dashboard-types'

/**
 * Facility-wide overview cards (Needle Booth & Manpower) displayed once above tabs
 * so company-wide metadata is retained without duplication across groups.
 */
export function FacilityOverviewStrip({
  facilityKpis,
}: {
  facilityKpis: FacilityKPIData
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <div className="bg-white rounded-erp-lg border border-surface-border border-l-4 border-l-blue-500 shadow-xs px-3.5 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Store className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
              TOTAL NEEDLE BOOTH
            </span>
            <span className="text-[11px] text-ink-muted block truncate">
              Needle Distribution Center
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {facilityKpis.needleBoothCount !== null ? (
            <span className="text-lg font-black text-ink font-mono">
              {facilityKpis.needleBoothCount.toLocaleString()}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-400 italic px-2 py-0.5 rounded bg-slate-100">
              Not Available
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-erp-lg border border-surface-border border-l-4 border-l-purple-500 shadow-xs px-3.5 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
              TOTAL MANPOWER
            </span>
            <span className="text-[11px] text-ink-muted block truncate">
              Needle Section Staff
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {facilityKpis.manpowerCount !== null ? (
            <span className="text-lg font-black text-ink font-mono">
              {facilityKpis.manpowerCount.toLocaleString()}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-400 italic px-2 py-0.5 rounded bg-slate-100">
              Not Available
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Normal Needle KPI Grid (Blue / Purple / Emerald Theme)
 * Strictly aggregates RUNNING + NEW only (never includes IDLE).
 */
export function NormalKPICards({
  kpis,
  selectedDate,
  selectedMonthLabel,
  showRunning,
  showNew,
}: {
  kpis: NormalKPIData
  selectedDate: string
  selectedMonthLabel: string
  showRunning: boolean
  showNew: boolean
}) {
  const effectiveStock =
    (showRunning ? kpis.runningStock : 0) + (showNew ? kpis.newStock : 0)
  const effectiveTodayRecv =
    (showRunning ? kpis.todayRunningReceived : 0) +
    (showNew ? kpis.todayNewReceived : 0)
  const effectiveTodayDel =
    (showRunning ? kpis.todayRunningDelivery : 0) +
    (showNew ? kpis.todayNewDelivery : 0)
  const effectiveMonthRecv =
    (showRunning ? kpis.monthlyRunningReceived : 0) +
    (showNew ? kpis.monthlyNewReceived : 0)
  const effectiveMonthDel =
    (showRunning ? kpis.monthlyRunningDelivery : 0) +
    (showNew ? kpis.monthlyNewDelivery : 0)

  const cards = [
    ...(showRunning
      ? [
          {
            id: 'running-stock',
            title: 'REGULAR STOCK',
            value: kpis.runningStock.toLocaleString(),
            unit: 'PCS',
            icon: Layers,
            accentBorder: 'border-l-blue-600',
            iconBg: 'bg-blue-50 text-blue-600',
            subtitle: `Regular Needle (${selectedDate})`,
          },
        ]
      : []),
    ...(showNew
      ? [
          {
            id: 'new-stock',
            title: 'NEW STOCK',
            value: kpis.newStock.toLocaleString(),
            unit: 'PCS',
            icon: Layers,
            accentBorder: 'border-l-purple-600',
            iconBg: 'bg-purple-50 text-purple-600',
            subtitle: `New Needle (${selectedDate})`,
          },
        ]
      : []),
    {
      id: 'total-normal-stock',
      title: 'TOTAL NORMAL STOCK',
      value: effectiveStock.toLocaleString(),
      unit: 'PCS',
      icon: Boxes,
      accentBorder: 'border-l-indigo-600',
      iconBg: 'bg-indigo-50 text-indigo-600',
      subtitle:
        showRunning && showNew
          ? `R: ${kpis.runningStock.toLocaleString()} | N: ${kpis.newStock.toLocaleString()}`
          : `Closing as of ${selectedDate}`,
    },
    {
      id: 'normal-today-recv',
      title: 'TODAY RECEIVED',
      value: effectiveTodayRecv.toLocaleString(),
      unit: 'PCS',
      icon: ArrowDownLeft,
      accentBorder: 'border-l-emerald-500',
      iconBg: 'bg-emerald-50 text-emerald-600',
      subtitle:
        showRunning && showNew
          ? `R: ${kpis.todayRunningReceived.toLocaleString()} | N: ${kpis.todayNewReceived.toLocaleString()}`
          : `Date: ${selectedDate}`,
    },
    {
      id: 'normal-today-del',
      title: 'TODAY DELIVERED',
      value: effectiveTodayDel.toLocaleString(),
      unit: 'PCS',
      icon: ArrowUpRight,
      accentBorder: 'border-l-blue-500',
      iconBg: 'bg-blue-50 text-blue-600',
      subtitle:
        showRunning && showNew
          ? `R: ${kpis.todayRunningDelivery.toLocaleString()} | N: ${kpis.todayNewDelivery.toLocaleString()}`
          : `Date: ${selectedDate}`,
    },
    {
      id: 'normal-month-recv',
      title: 'MONTHLY RECEIVED',
      value: effectiveMonthRecv.toLocaleString(),
      unit: 'PCS',
      icon: CalendarArrowDown,
      accentBorder: 'border-l-cyan-500',
      iconBg: 'bg-cyan-50 text-cyan-600',
      subtitle:
        showRunning && showNew
          ? `R: ${kpis.monthlyRunningReceived.toLocaleString()} | N: ${kpis.monthlyNewReceived.toLocaleString()}`
          : selectedMonthLabel,
    },
    {
      id: 'normal-month-del',
      title: 'MONTHLY DELIVERED',
      value: effectiveMonthDel.toLocaleString(),
      unit: 'PCS',
      icon: CalendarArrowUp,
      accentBorder: 'border-l-violet-500',
      iconBg: 'bg-violet-50 text-violet-600',
      subtitle:
        showRunning && showNew
          ? `R: ${kpis.monthlyRunningDelivery.toLocaleString()} | N: ${kpis.monthlyNewDelivery.toLocaleString()}`
          : selectedMonthLabel,
    },
  ]

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ${
        cards.length >= 7 ? 'lg:grid-cols-7' : 'lg:grid-cols-6'
      } gap-2.5`}
    >
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.id}
            className={`bg-white rounded-erp-lg border border-surface-border shadow-xs p-3 flex flex-col justify-between border-l-4 ${card.accentBorder} hover:shadow-sm transition-all duration-150`}
          >
            <div className="flex items-start justify-between gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider leading-tight">
                {card.title}
              </span>
              <div
                className={`w-7 h-7 rounded-md ${card.iconBg} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="my-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-ink tracking-tight font-mono">
                {card.value}
              </span>
              <span className="text-[10px] font-bold text-ink-muted">{card.unit}</span>
            </div>

            <div className="text-[10px] text-ink-muted truncate border-t border-surface-border/60 pt-1 mt-1">
              {card.subtitle}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Idle Needle KPI Grid (Amber / Teal / Orange Theme)
 * Strictly uses IDLE data only.
 */
export function IdleKPICards({
  kpis,
  selectedDate,
  selectedMonthLabel,
}: {
  kpis: IdleKPIData
  selectedDate: string
  selectedMonthLabel: string
}) {
  const cards = [
    {
      id: 'idle-total-stock',
      title: 'TOTAL IDLE STOCK',
      value: kpis.totalIdleStock.toLocaleString(),
      unit: 'PCS',
      icon: Boxes,
      accentBorder: 'border-l-teal-600',
      iconBg: 'bg-teal-50 text-teal-600',
      subtitle: `Idle closing (${selectedDate})`,
    },
    {
      id: 'idle-today-recv',
      title: 'IDLE TODAY RECEIVED',
      value: kpis.todayReceived.toLocaleString(),
      unit: 'PCS',
      icon: ArrowDownLeft,
      accentBorder: 'border-l-emerald-500',
      iconBg: 'bg-emerald-50 text-emerald-600',
      subtitle: `Date: ${selectedDate}`,
    },
    {
      id: 'idle-today-del',
      title: 'IDLE TODAY DELIVERED',
      value: kpis.todayDelivery.toLocaleString(),
      unit: 'PCS',
      icon: ArrowUpRight,
      accentBorder: 'border-l-orange-500',
      iconBg: 'bg-orange-50 text-orange-600',
      subtitle: `Date: ${selectedDate}`,
    },
    {
      id: 'idle-month-recv',
      title: 'IDLE MONTHLY RECEIVED',
      value: kpis.monthlyReceived.toLocaleString(),
      unit: 'PCS',
      icon: CalendarArrowDown,
      accentBorder: 'border-l-amber-500',
      iconBg: 'bg-amber-50 text-amber-600',
      subtitle: selectedMonthLabel,
    },
    {
      id: 'idle-month-del',
      title: 'IDLE MONTHLY DELIVERED',
      value: kpis.monthlyDelivery.toLocaleString(),
      unit: 'PCS',
      icon: CalendarArrowUp,
      accentBorder: 'border-l-orange-600',
      iconBg: 'bg-orange-50 text-orange-700',
      subtitle: selectedMonthLabel,
    },
    {
      id: 'idle-active-floors',
      title: 'FLOORS WITH IDLE STOCK',
      value: `${kpis.activeIdleFloorsCount} / ${kpis.totalAuthorizedFloorsCount}`,
      unit: 'FLOORS',
      icon: MapPin,
      accentBorder: 'border-l-amber-600',
      iconBg: 'bg-amber-50 text-amber-700',
      subtitle: 'Holding > 0 PCS idle stock',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.id}
            className={`bg-white rounded-erp-lg border border-surface-border shadow-xs p-3 flex flex-col justify-between border-l-4 ${card.accentBorder} hover:shadow-sm transition-all duration-150`}
          >
            <div className="flex items-start justify-between gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider leading-tight">
                {card.title}
              </span>
              <div
                className={`w-7 h-7 rounded-md ${card.iconBg} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="my-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-ink tracking-tight font-mono">
                {card.value}
              </span>
              <span className="text-[10px] font-bold text-ink-muted">{card.unit}</span>
            </div>

            <div className="text-[10px] text-ink-muted truncate border-t border-surface-border/60 pt-1 mt-1">
              {card.subtitle}
            </div>
          </div>
        )
      })}
    </div>
  )
}
