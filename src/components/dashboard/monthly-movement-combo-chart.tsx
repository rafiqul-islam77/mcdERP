'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts'
import type { MonthlyClosingStockPoint } from '@/lib/dashboard/dashboard-types'
import { formatCompactChartNumber } from './chart-formatters'

interface MonthlyMovementComboChartProps {
  trendPoints: MonthlyClosingStockPoint[]
  mode: 'NORMAL' | 'IDLE'
  normalSubCategory?: 'ALL_NORMAL' | 'RUNNING' | 'NEW'
  height?: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1">
        <div className="font-bold border-b border-slate-800 pb-1 text-slate-200">
          {label} (Movement vs. Closing Stock)
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
      </div>
    )
  }
  return null
}

/**
 * Combination Chart (Columns + Line on compatible dual Y-axes):
 * - Monthly Received -> Emerald / Teal columns (Left Axis: Monthly Flow PCS)
 * - Monthly Delivered -> Orange / Amber columns (Left Axis: Monthly Flow PCS)
 * - Monthly Closing Stock -> Royal Blue / Coral Line with markers (Right Axis: Closing Stock PCS)
 */
export function MonthlyMovementComboChart({
  trendPoints,
  mode,
  normalSubCategory = 'ALL_NORMAL',
  height = 280,
}: MonthlyMovementComboChartProps) {
  const receivedColor = mode === 'NORMAL' ? '#10B981' : '#0D9488'
  const deliveryColor = mode === 'NORMAL' ? '#F97316' : '#F59E0B'
  const stockLineColor = mode === 'NORMAL' ? '#2563EB' : '#EA580C'

  const chartData = React.useMemo(() => {
    return trendPoints.map((pt) => {
      if (mode === 'IDLE') {
        return {
          name: pt.monthLabel,
          Received: pt.idleReceived,
          Delivered: pt.idleDelivery,
          ClosingStock: pt.idleStock,
        }
      }
      if (normalSubCategory === 'RUNNING') {
        return {
          name: pt.monthLabel,
          Received: pt.runningReceived,
          Delivered: pt.runningDelivery,
          ClosingStock: pt.runningStock,
        }
      }
      if (normalSubCategory === 'NEW') {
        return {
          name: pt.monthLabel,
          Received: pt.newReceived,
          Delivered: pt.newDelivery,
          ClosingStock: pt.newStock,
        }
      }
      return {
        name: pt.monthLabel,
        Received: pt.normalReceived,
        Delivered: pt.normalDelivery,
        ClosingStock: pt.normalTotalStock,
      }
    })
  }, [trendPoints, mode, normalSubCategory])

  const hasData = chartData.some(
    (d) => d.Received > 0 || d.Delivered > 0 || d.ClosingStock > 0
  )

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>No historical movement or stock recorded for this group</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          barGap={3}
          margin={{ top: 20, right: 6, left: -12, bottom: 26 }}
        >
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
            yAxisId="flow"
            tick={{ fontSize: 10, fill: '#64748B' }}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="stock"
            orientation="right"
            tick={{ fontSize: 10, fill: stockLineColor, fontWeight: 600 }}
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
            wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 600 }}
          />
          <Bar
            yAxisId="flow"
            dataKey="Received"
            fill={receivedColor}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
          />
          <Bar
            yAxisId="flow"
            dataKey="Delivered"
            fill={deliveryColor}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
          />
          <Line
            yAxisId="stock"
            type="monotone"
            dataKey="ClosingStock"
            name="Closing Stock"
            stroke={stockLineColor}
            strokeWidth={2.75}
            dot={{ r: 4, fill: '#ffffff', stroke: stockLineColor, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: stockLineColor, stroke: '#ffffff', strokeWidth: 2 }}
          >
            <LabelList
              dataKey="ClosingStock"
              position="top"
              offset={8}
              formatter={formatCompactChartNumber}
              style={{ fontSize: '9px', fontWeight: 700, fill: stockLineColor }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
