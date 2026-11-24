'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { MonthlyClosingStockPoint } from '@/lib/dashboard/dashboard-types'

interface MonthlyStockChartProps {
  trendPoints: MonthlyClosingStockPoint[]
  dataKey: 'runningStock' | 'newStock' | 'idleStock' | 'normalTotalStock'
  color?: string
  height?: number
  categoryLabel?: string
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const entry = payload[0]
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1">
        <div className="font-bold border-b border-slate-800 pb-1 text-slate-200">
          {label} (Month-End Closing)
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: entry.color }}
            />
            Closing Stock:
          </span>
          <span className="font-mono font-bold text-white">
            {Number(entry.value).toLocaleString()} PCS
          </span>
        </div>
      </div>
    )
  }
  return null
}

/**
 * Distinct Line Graph displaying Month-End Closing Stock across 12 months.
 * Features smooth curves, crisp strokes, and visible data point dots.
 */
export function MonthlyStockChart({
  trendPoints,
  dataKey,
  color = '#2563EB', // Royal Blue
  height = 260,
  categoryLabel = 'Needle',
}: MonthlyStockChartProps) {
  const chartData = React.useMemo(() => {
    return trendPoints.map((pt) => ({
      name: pt.monthLabel,
      [categoryLabel]: pt[dataKey],
    }))
  }, [trendPoints, dataKey, categoryLabel])

  const hasData = chartData.some((d) => Number(d[categoryLabel]) > 0)

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>No historical monthly trend data for {categoryLabel}</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 16, left: -12, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
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
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="plainline"
            wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey={categoryLabel}
            stroke={color}
            strokeWidth={2.75}
            dot={{ r: 4, strokeWidth: 2, fill: '#ffffff', stroke: color }}
            activeDot={{ r: 6, strokeWidth: 2, fill: color, stroke: '#ffffff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Summary card for Monthly Stock Trend (shows latest month closing stock and trend vs prior month)
 */
export function TotalMonthlyStockSummaryCard({
  trendPoints,
  dataKey,
  categoryLabel,
  color = 'text-blue-600',
  bgColor = 'bg-blue-50/60',
  borderColor = 'border-blue-200',
}: {
  trendPoints: MonthlyClosingStockPoint[]
  dataKey: 'runningStock' | 'newStock' | 'idleStock' | 'normalTotalStock'
  categoryLabel: string
  color?: string
  bgColor?: string
  borderColor?: string
}) {
  const latest = trendPoints[trendPoints.length - 1]
  const prior = trendPoints.length > 1 ? trendPoints[trendPoints.length - 2] : null

  const latestVal = latest ? latest[dataKey] : 0
  const priorVal = prior ? prior[dataKey] : 0
  const diff = latestVal - priorVal
  const diffPct = priorVal > 0 ? Math.round((diff / priorVal) * 1000) / 10 : 0

  return (
    <div className="flex flex-col justify-between h-full p-4 rounded-erp border border-surface-border bg-slate-50/40">
      <div>
        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
          TOTAL MONTH-WISE STOCK QTY (PCS)
        </span>
        <span className="text-xs text-ink-muted block mt-0.5">
          {categoryLabel} closing balance ({latest?.monthLabel || 'latest month'})
        </span>

        <div className="my-4">
          <div className={`text-3xl font-black tracking-tight font-mono ${color}`}>
            {latestVal.toLocaleString()}
          </div>
          <span className="text-xs font-bold text-ink-muted">CLOSING BALANCE PCS</span>
        </div>
      </div>

      <div className={`p-3 rounded-erp border ${borderColor} ${bgColor} space-y-2`}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted font-medium">Prior Month Closing:</span>
          <span className="font-bold text-ink font-mono">{priorVal.toLocaleString()} PCS</span>
        </div>
        <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-border/50">
          <span className="text-ink-muted font-medium">Month-on-Month Change:</span>
          <span
            className={`font-bold flex items-center gap-1 font-mono ${
              diff > 0
                ? 'text-emerald-600'
                : diff < 0
                ? 'text-rose-600'
                : 'text-slate-500'
            }`}
          >
            {diff > 0 ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : diff < 0 ? (
              <TrendingDown className="w-3.5 h-3.5" />
            ) : (
              <Minus className="w-3.5 h-3.5" />
            )}
            <span>
              {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()} PCS (
              {diff > 0 ? `+${diffPct}` : diffPct}%)
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
