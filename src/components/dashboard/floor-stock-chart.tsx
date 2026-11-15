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
} from 'recharts'
import type { FloorStockItem } from '@/lib/dashboard/dashboard-types'

interface FloorStockChartProps {
  items: FloorStockItem[]
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
          {label}
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

export function FloorStockChart({
  items,
  color = '#3B82F6', // Blue default
  height = 260,
  categoryLabel = 'Needle',
}: FloorStockChartProps) {
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
            tick={{ fontSize: 11, fill: '#64748B' }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748B' }}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="Stock"
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
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
    <div className="flex flex-col justify-between h-full p-4 rounded-erp border border-surface-border bg-slate-50/40">
      <div>
        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
          TOTAL FLOOR-WISE STOCK QTY (PCS)
        </span>
        <span className="text-xs text-ink-muted block mt-0.5">
          {categoryLabel} closing balance across authorized floors
        </span>

        <div className="my-4">
          <div className="text-3xl font-black text-ink tracking-tight font-mono">
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
