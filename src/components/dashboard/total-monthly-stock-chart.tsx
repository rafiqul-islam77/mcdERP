'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { DailyEntryCategory } from '@/types'
import type { MonthlyClosingStockPoint } from '@/lib/dashboard/dashboard-types'

interface TotalNormalMonthlyStockChartProps {
  trendPoints: MonthlyClosingStockPoint[]
  authorizedCategories: DailyEntryCategory[]
  showRunning?: boolean
  showNew?: boolean
  height?: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, entry: any) => sum + Number(entry.value || 0), 0)
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1.5">
        <div className="font-bold border-b border-slate-800 pb-1 text-slate-200">
          {label} (Normal Closing Stock)
        </div>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}:
            </span>
            <span className="font-mono font-bold text-white">
              {Number(entry.value).toLocaleString()} PCS
            </span>
          </div>
        ))}
        <div className="border-t border-slate-700/80 pt-1 flex items-center justify-between font-bold text-emerald-400">
          <span>Normal Combined Total:</span>
          <span className="font-mono">{total.toLocaleString()} PCS</span>
        </div>
      </div>
    )
  }
  return null
}

/**
 * Stacked Bar Chart strictly for Normal Needle (RUNNING + NEW).
 * Never combines IDLE stock into Normal totals.
 */
export function TotalMonthlyStockChart({
  trendPoints,
  authorizedCategories,
  showRunning = true,
  showNew = true,
  height = 280,
}: TotalNormalMonthlyStockChartProps) {
  const includeRunning = showRunning && authorizedCategories.includes('RUNNING')
  const includeNew = showNew && authorizedCategories.includes('NEW')

  const chartData = React.useMemo(() => {
    return trendPoints.map((pt) => {
      const rVal = includeRunning ? pt.runningStock : 0
      const nVal = includeNew ? pt.newStock : 0
      return {
        name: pt.monthLabel,
        ...(includeRunning ? { Regular: rVal } : {}),
        ...(includeNew ? { New: nVal } : {}),
        NormalTotal: rVal + nVal,
      }
    })
  }, [trendPoints, includeRunning, includeNew])

  const hasData = chartData.some((d) => d.NormalTotal > 0)

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>No Normal Needle monthly closing stock recorded</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 12, left: -12, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
            interval="preserveStartEnd"
            angle={-25}
            textAnchor="end"
            height={42}
            axisLine={{ stroke: '#CBD5E1' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748B' }}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontWeight: 600 }}
          />
          {includeRunning && (
            <Bar
              dataKey="Regular"
              stackId="normalStockStack"
              fill="#2563EB" // Royal Blue
              maxBarSize={34}
              radius={!includeNew ? [5, 5, 0, 0] : [0, 0, 0, 0]}
            />
          )}
          {includeNew && (
            <Bar
              dataKey="New"
              stackId="normalStockStack"
              fill="#8B5CF6" // Purple
              maxBarSize={34}
              radius={[5, 5, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Adjacent summary card for Combined Normal Monthly Closing Stock (RUNNING + NEW only).
 */
export function TotalMonthlyCombinedSummaryCard({
  trendPoints,
  authorizedCategories,
  showRunning = true,
  showNew = true,
}: {
  trendPoints: MonthlyClosingStockPoint[]
  authorizedCategories: DailyEntryCategory[]
  showRunning?: boolean
  showNew?: boolean
}) {
  const includeRunning = showRunning && authorizedCategories.includes('RUNNING')
  const includeNew = showNew && authorizedCategories.includes('NEW')

  const latest = trendPoints[trendPoints.length - 1]
  const running = includeRunning && latest ? latest.runningStock : 0
  const newStock = includeNew && latest ? latest.newStock : 0
  const total = running + newStock

  return (
    <div className="flex flex-col justify-between h-full p-4 rounded-erp border border-surface-border bg-slate-50/40">
      <div>
        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
          TOTAL NORMAL MONTH-WISE STOCK (PCS)
        </span>
        <span className="text-xs text-ink-muted block mt-0.5">
          Normal closing balance ({latest?.monthLabel || 'latest month'})
        </span>

        <div className="my-4">
          <div className="text-3xl font-black text-indigo-700 tracking-tight font-mono">
            {total.toLocaleString()}
          </div>
          <span className="text-xs font-bold text-ink-muted">TOTAL NORMAL PCS</span>
        </div>
      </div>

      <div className="p-3 rounded-erp border border-indigo-200 bg-indigo-50/40 space-y-2">
        <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block border-b border-indigo-200/70 pb-1">
          Normal Category Split
        </span>
        {includeRunning && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              Regular:
            </span>
            <span className="font-bold text-ink font-mono">{running.toLocaleString()} PCS</span>
          </div>
        )}
        {includeNew && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
              New Needle:
            </span>
            <span className="font-bold text-ink font-mono">{newStock.toLocaleString()} PCS</span>
          </div>
        )}
      </div>
    </div>
  )
}
