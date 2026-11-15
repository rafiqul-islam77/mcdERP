'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'
import type { StockDistributionItem } from '@/lib/dashboard/dashboard-types'

interface StockDistributionChartProps {
  items: StockDistributionItem[]
  height?: number
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-bold">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: data.payload.fill }}
          />
          <span>{data.name}</span>
        </div>
        <div className="font-mono text-white text-xs">
          {Number(data.value).toLocaleString()} PCS ({data.payload.percentage}%)
        </div>
      </div>
    )
  }
  return null
}

export function StockDistributionChart({
  items,
  height = 260,
}: StockDistributionChartProps) {
  const grandTotal = React.useMemo(() => {
    return items.reduce((acc, curr) => acc + curr.quantity, 0)
  }, [items])

  const chartData = React.useMemo(() => {
    return items.map((it) => ({
      name: it.label,
      value: it.quantity,
      percentage: it.percentage,
      fill: it.color,
    }))
  }, [items])

  const hasData = grandTotal > 0

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>No stock distribution data available</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center" style={{ minHeight: height }}>
      {/* Donut Chart */}
      <div style={{ width: '100%', height: height - 20 }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={chartData}
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={4}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
            Total Stock
          </span>
          <span className="text-xl font-black text-ink">
            {grandTotal.toLocaleString()}
          </span>
          <span className="text-[10px] font-bold text-ink-muted">PCS</span>
        </div>
      </div>

      {/* Breakdown Items List */}
      <div className="space-y-2.5">
        {items.map((item) => (
          <div
            key={item.category}
            className="p-2.5 rounded-erp border border-surface-border bg-slate-50/60 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <div>
                <span className="text-xs font-bold text-ink block">
                  {item.label}
                </span>
                <span className="text-[10px] text-ink-muted">
                  Share: {item.percentage}%
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-black text-ink font-mono block">
                {item.quantity.toLocaleString()}
              </span>
              <span className="text-[10px] font-semibold text-ink-muted">PCS</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
