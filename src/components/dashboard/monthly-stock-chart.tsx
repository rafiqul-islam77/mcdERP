'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { MonthlyClosingStockPoint } from '@/lib/dashboard/dashboard-types'
import { formatCompactChartNumber } from './chart-formatters'

interface MonthlyStockChartProps {
  trendPoints: MonthlyClosingStockPoint[]
  dataKey: 'runningStock' | 'newStock' | 'idleStock' | 'normalTotalStock'
  chartType?: 'line' | 'area'
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
 * Supports both Smooth Line Chart (with distinct markers & data labels)
 * and Area Chart (with subtle gradient fill & markers) for Month-End Closing Stock.
 */
export function MonthlyStockChart({
  trendPoints,
  dataKey,
  chartType = 'line',
  color = '#2563EB',
  height = 270,
  categoryLabel = 'Needle',
}: MonthlyStockChartProps) {
  const uid = React.useId().replace(/:/g, '')
  const gradId = `monthlyStockArea-${uid}`

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

  if (chartType === 'area') {
    return (
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 22, right: 18, left: -10, bottom: 26 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.38} />
                <stop offset="95%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
              interval="preserveStartEnd"
              angle={-25}
              textAnchor="end"
              height={44}
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
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey={categoryLabel}
              stroke={color}
              strokeWidth={2.5}
              fillOpacity={1}
              fill={`url(#${gradId})`}
              dot={{ r: 3.5, strokeWidth: 2, fill: '#ffffff', stroke: color }}
              activeDot={{ r: 6, strokeWidth: 2, fill: color, stroke: '#ffffff' }}
            >
              <LabelList
                dataKey={categoryLabel}
                position="top"
                offset={8}
                formatter={formatCompactChartNumber}
                style={{ fontSize: '9.5px', fontWeight: 700, fill: color }}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 22, right: 18, left: -10, bottom: 26 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
            interval="preserveStartEnd"
            angle={-25}
            textAnchor="end"
            height={44}
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
            wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey={categoryLabel}
            stroke={color}
            strokeWidth={3}
            dot={{ r: 4.5, strokeWidth: 2, fill: '#ffffff', stroke: color }}
            activeDot={{ r: 6.5, strokeWidth: 2, fill: color, stroke: '#ffffff' }}
          >
            <LabelList
              dataKey={categoryLabel}
              position="top"
              offset={9}
              formatter={formatCompactChartNumber}
              style={{ fontSize: '9.5px', fontWeight: 700, fill: color }}
            />
          </Line>
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
    <div className="flex flex-col justify-between h-full p-4 rounded-erp border border-surface-border bg-white/80">
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
