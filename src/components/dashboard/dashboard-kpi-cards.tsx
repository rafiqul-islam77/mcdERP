import * as React from 'react'
import {
  Store,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarArrowDown,
  CalendarArrowUp,
  Boxes,
} from 'lucide-react'
import type { DashboardKPIData } from '@/lib/dashboard/dashboard-types'

interface DashboardKPICardsProps {
  kpis: DashboardKPIData
  selectedDate: string
  selectedMonthLabel: string
}

export function DashboardKPICards({
  kpis,
  selectedDate,
  selectedMonthLabel,
}: DashboardKPICardsProps) {
  const cards = [
    {
      id: 'needle-booth',
      title: 'TOTAL NEEDLE BOOTH',
      value: kpis.needleBoothCount !== null ? kpis.needleBoothCount.toLocaleString() : 'Not Available',
      unit: kpis.needleBoothCount !== null ? 'BOOTHS' : '',
      icon: Store,
      accentBorder: 'border-l-blue-500',
      iconBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600',
      badgeColor: 'bg-blue-100 text-blue-800',
      subtitle: 'Needle Distribution Center',
      isAvailable: kpis.needleBoothCount !== null,
    },
    {
      id: 'manpower',
      title: 'TOTAL MANPOWER',
      value: kpis.manpowerCount !== null ? kpis.manpowerCount.toLocaleString() : 'Not Available',
      unit: kpis.manpowerCount !== null ? 'STAFF' : '',
      icon: Users,
      accentBorder: 'border-l-purple-500',
      iconBg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600',
      badgeColor: 'bg-purple-100 text-purple-800',
      subtitle: 'Needle Section Staff',
      isAvailable: kpis.manpowerCount !== null,
    },
    {
      id: 'today-receive',
      title: 'TODAY RECEIVE',
      value: kpis.todayReceive.toLocaleString(),
      unit: 'PCS',
      icon: ArrowDownLeft,
      accentBorder: 'border-l-emerald-500',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      subtitle: `Date: ${selectedDate}`,
      isAvailable: true,
    },
    {
      id: 'today-delivery',
      title: 'TODAY DELIVERY',
      value: kpis.todayDelivery.toLocaleString(),
      unit: 'PCS',
      icon: ArrowUpRight,
      accentBorder: 'border-l-orange-500',
      iconBg: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600',
      badgeColor: 'bg-orange-100 text-orange-800',
      subtitle: `Date: ${selectedDate}`,
      isAvailable: true,
    },
    {
      id: 'monthly-receive',
      title: 'MONTHLY RECEIVE',
      value: kpis.monthlyReceive.toLocaleString(),
      unit: 'PCS',
      icon: CalendarArrowDown,
      accentBorder: 'border-l-cyan-500',
      iconBg: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600',
      badgeColor: 'bg-cyan-100 text-cyan-800',
      subtitle: selectedMonthLabel,
      isAvailable: true,
    },
    {
      id: 'monthly-delivery',
      title: 'MONTHLY DELIVERY',
      value: kpis.monthlyDelivery.toLocaleString(),
      unit: 'PCS',
      icon: CalendarArrowUp,
      accentBorder: 'border-l-amber-500',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600',
      badgeColor: 'bg-amber-100 text-amber-800',
      subtitle: selectedMonthLabel,
      isAvailable: true,
    },
    {
      id: 'total-stock',
      title: 'TOTAL STOCK QTY',
      value: kpis.totalStockQty.toLocaleString(),
      unit: 'PCS',
      icon: Boxes,
      accentBorder: 'border-l-teal-500',
      iconBg: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600',
      badgeColor: 'bg-teal-100 text-teal-800',
      subtitle: `Closing as of ${selectedDate}`,
      isAvailable: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.id}
            className={`bg-white rounded-erp-lg border border-surface-border shadow-xs p-3 flex flex-col justify-between border-l-4 ${card.accentBorder} hover:shadow-sm transition-all duration-150`}
          >
            {/* Header: Title + Icon */}
            <div className="flex items-start justify-between gap-1.5 mb-2">
              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider leading-tight">
                {card.title}
              </span>
              <div
                className={`w-7 h-7 rounded-md ${card.iconBg} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            {/* Value & Unit */}
            <div className="my-1">
              {card.isAvailable ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-ink tracking-tight">
                    {card.value}
                  </span>
                  {card.unit && (
                    <span className="text-[10px] font-bold text-ink-muted">
                      {card.unit}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-xs font-semibold text-slate-400 italic py-1">
                  Not Available
                </div>
              )}
            </div>

            {/* Subtitle / Context Note */}
            <div className="text-[10px] text-ink-muted truncate border-t border-surface-border/60 pt-1 mt-1">
              {card.subtitle}
            </div>
          </div>
        )
      })}
    </div>
  )
}
