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

interface TotalMonthlyStockChartProps {
  trendPoints: MonthlyClosingStockPoint[]
  authorizedCategories: DailyEntryCategory[]
  height?: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, entry: any) => sum + Number(entry.value || 0), 0)
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1.5">
        <div className="font-bold border-b border-slate-800 pb-1 text-slate-200">
          {label} (Closing Stock)
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
          <span>Combined Total:</span>
          <span className="font-mono">{total.toLocaleString()} PCS</span>
        </div>
      </div>
    )
  }
  return null
}

export function TotalMonthlyStockChart({
  trendPoints,
  authorizedCategories,
  height = 280,
}: TotalMonthlyStockChartProps) {
  const chartData = React.useMemo(() => {
    return trendPoints.map((pt) => ({
      name: pt.monthLabel,
      ...(authorizedCategories.includes('RUNNING') ? { Regular: pt.runningStock } : {}),
      ...(authorizedCategories.includes('NEW') ? { New: pt.newStock } : {}),
      ...(authorizedCategories.includes('IDLE') ? { Idle: pt.idleStock } : {}),
      Total: pt.totalStock,
    }))
  }, [trendPoints, authorizedCategories])

  const hasData = chartData.some((d) => d.Total > 0)

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>No multi-category monthly stock data recorded</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -15, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#64748B' }}
            interval="preserveStartEnd"
            angle={-25}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748B' }}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
          />
          {authorizedCategories.includes('RUNNING') && (
            <Bar
              dataKey="Regular"
              stackId="stockStack"
              fill="#3B82F6" // Blue
              maxBarSize={36}
            />
          )}
          {authorizedCategories.includes('NEW') && (
            <Bar
              dataKey="New"
              stackId="stockStack"
              fill="#8B5CF6" // Purple
              maxBarSize={36}
            />
          )}
          {authorizedCategories.includes('IDLE') && (
            <Bar
              dataKey="Idle"
              stackId="stockStack"
              fill="#F59E0B" // Amber
              maxBarSize={36}
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Adjacent summary card for Combined Monthly Closing Stock
 */
export function TotalMonthlyCombinedSummaryCard({
  trendPoints,
  authorizedCategories,
}: {
  trendPoints: MonthlyClosingStockPoint[]
  authorizedCategories: DailyEntryCategory[]
}) {
  const latest = trendPoints[trendPoints.length - 1]
  const running = latest ? latest.runningStock : 0
  const newStock = latest ? latest.newStock : 0
  const idle = latest ? latest.idleStock : 0
  const total = running + newStock + idle

  return (
    <div className="flex flex-col justify-between h-full p-4 rounded-erp border border-surface-border bg-slate-50/40">
      <div>
        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
          TOTAL MONTH-WISE STOCK QTY (PCS)
        </span>
        <span className="text-xs text-ink-muted block mt-0.5">
          All categories combined closing balance ({latest?.monthLabel || 'latest month'})
        </span>

        <div className="my-4">
          <div className="text-3xl font-black text-ink tracking-tight font-mono">
            {total.toLocaleString()}
          </div>
          <span className="text-xs font-bold text-ink-muted">TOTAL INVENTORY PCS</span>
        </div>
      </div>

      <div className="p-3 rounded-erp border border-surface-border bg-white space-y-2">
        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block border-b pb-1">
          Category Breakdown
        </span>
        {authorizedCategories.includes('RUNNING') && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Regular:
            </span>
            <span className="font-bold text-ink font-mono">{running.toLocaleString()} PCS</span>
          </div>
        )}
        {authorizedCategories.includes('NEW') && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              New Needle:
            </span>
            <span className="font-bold text-ink font-mono">{newStock.toLocaleString()} PCS</span>
          </div>
        )}
        {authorizedCategories.includes('IDLE') && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Idle Needle:
            </span>
            <span className="font-bold text-ink font-mono">{idle.toLocaleString()} PCS</span>
          </div>
        )}
      </div>
    </div>
  )
}
