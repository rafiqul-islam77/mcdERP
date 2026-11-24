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
  LabelList,
} from 'recharts'
import type { FloorStockItem } from '@/lib/dashboard/dashboard-types'
import { formatCompactChartNumber } from './chart-formatters'

interface FloorStockChartProps {
  items: FloorStockItem[]
  color?: string
  gradientToColor?: string
  orientation?: 'vertical' | 'horizontal'
  useGradient?: boolean
  showDataLabels?: boolean
  height?: number
  categoryLabel?: string
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const entry = payload[0]
    const fullName = entry?.payload?.fullName || label
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1">
        <div className="font-bold border-b border-slate-800 pb-1 text-slate-200">
          {fullName}
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Closing Stock:</span>
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
 * Floor-wise Stock Chart supporting both Horizontal Bar and Vertical Gradient Column layouts
 * with direct PCS data labels on bars.
 */
export function FloorStockChart({
  items,
  color = '#2563EB',
  gradientToColor = '#06B6D4',
  orientation = 'vertical',
  useGradient = true,
  showDataLabels = true,
  height = 280,
  categoryLabel = 'Needle',
}: FloorStockChartProps) {
  const uid = React.useId().replace(/:/g, '')
  const gradId = `floorStockGrad-${uid}`

  const chartData = React.useMemo(() => {
    return items.map((it) => ({
      name: it.floorCode || it.floorName,
      fullName: it.floorName,
      Stock: it.stock,
    }))
  }, [items])

  const hasData = chartData.some((d) => d.Stock > 0)

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>No stock balance recorded for {categoryLabel}</span>
      </div>
    )
  }

  const barFill = useGradient ? `url(#${gradId})` : color

  if (orientation === 'horizontal') {
    const sorted = [...chartData].sort((a, b) => b.Stock - a.Stock)
    const dynamicHeight = Math.max(height, sorted.length * 26 + 32)

    return (
      <div style={{ width: '100%', height: dynamicHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 6, right: 48, left: 6, bottom: 6 }}
          >
            {useGradient && (
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={color} />
                  <stop offset="100%" stopColor={gradientToColor} />
                </linearGradient>
              </defs>
            )}
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: '#64748B' }}
              tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
              axisLine={{ stroke: '#CBD5E1' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={78}
              tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
            <Bar
              dataKey="Stock"
              fill={barFill}
              radius={[0, 6, 6, 0]}
              maxBarSize={18}
            >
              {showDataLabels && (
                <LabelList
                  dataKey="Stock"
                  position="right"
                  formatter={formatCompactChartNumber}
                  style={{ fontSize: '10px', fontWeight: 700, fill: '#1E293B' }}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 22, right: 12, left: -12, bottom: 26 }}
        >
          {useGradient && (
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor={gradientToColor} />
              </linearGradient>
            </defs>
          )}
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
            interval={0}
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
          <Bar
            dataKey="Stock"
            fill={barFill}
            radius={[6, 6, 0, 0]}
            maxBarSize={36}
          >
            {showDataLabels && (
              <LabelList
                dataKey="Stock"
                position="top"
                formatter={formatCompactChartNumber}
                style={{ fontSize: '10px', fontWeight: 700, fill: '#1E293B' }}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Adjacent summary card for Floor Stock
 */
export function TotalFloorStockCard({
  totalStock,
  floorCount,
  categoryLabel,
  color = 'text-blue-600',
  bgColor = 'bg-blue-50/60',
  borderColor = 'border-blue-200',
}: {
  totalStock: number
  floorCount: number
  categoryLabel: string
  color?: string
  bgColor?: string
  borderColor?: string
}) {
  const avgPerFloor = floorCount > 0 ? Math.round(totalStock / floorCount) : 0

  return (
    <div className="flex flex-col justify-between h-full p-4 rounded-erp border border-surface-border bg-white/80">
      <div>
        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
          TOTAL FLOOR-WISE STOCK QTY (PCS)
        </span>
        <span className="text-xs text-ink-muted block mt-0.5">
          {categoryLabel} closing balance across authorized floors
        </span>

        <div className="my-4">
          <div className={`text-3xl font-black tracking-tight font-mono ${color}`}>
            {totalStock.toLocaleString()}
          </div>
          <span className="text-xs font-bold text-ink-muted">TOTAL PCS</span>
        </div>
      </div>

      <div className={`p-3 rounded-erp border ${borderColor} ${bgColor} space-y-2`}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted font-medium">Authorized Floors:</span>
          <span className="font-bold text-ink">{floorCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted font-medium">Average / Floor:</span>
          <span className="font-bold text-ink font-mono">{avgPerFloor.toLocaleString()} PCS</span>
        </div>
      </div>
    </div>
  )
}
