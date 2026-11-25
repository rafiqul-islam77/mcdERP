'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Tooltip,
} from 'recharts'
import type { FloorStockItem } from '@/lib/dashboard/dashboard-types'

interface StockRadialChartProps {
  items: FloorStockItem[]
  palette?: string[]
  height?: number
  emptyMessage?: string
}

const DEFAULT_NORMAL_PALETTE = [
  '#2563EB', // Royal Blue
  '#10B981', // Emerald Green
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
  '#4F46E5', // Indigo
  '#F59E0B', // Amber
]

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const entry = payload[0]?.payload
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-bold">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.fill }}
          />
          <span>{entry.fullName}</span>
        </div>
        <div className="font-mono text-xs text-white">
          {Number(entry.stock).toLocaleString()} PCS ({entry.sharePct}% share)
        </div>
      </div>
    )
  }
  return null
}

/**
 * Concentric Radial Bar Chart showing top floors' closing stock share.
 * Visually distinct concentric ring chart inspired by executive KPI rings.
 */
export function StockRadialChart({
  items,
  palette = DEFAULT_NORMAL_PALETTE,
  height = 270,
  emptyMessage = 'No positive floor stock available',
}: StockRadialChartProps) {
  const { radialData, totalStock } = React.useMemo(() => {
    const positive = items
      .filter((f) => f.stock > 0)
      .sort((a, b) => b.stock - a.stock)
    const sum = positive.reduce((s, f) => s + f.stock, 0)
    const top = positive.slice(0, 6)

    // Reverse so largest ring is outermost in Recharts RadialBarChart
    const formatted = [...top].reverse().map((fl, idx) => {
      const originalIdx = top.length - 1 - idx
      return {
        name: fl.floorCode || fl.floorName,
        fullName: fl.floorName,
        stock: fl.stock,
        sharePct: sum > 0 ? Math.round((fl.stock / sum) * 1000) / 10 : 0,
        fill: palette[originalIdx % palette.length],
      }
    })

    return { radialData: formatted, totalStock: sum }
  }, [items, palette])

  if (radialData.length === 0 || totalStock === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>{emptyMessage}</span>
      </div>
    )
  }

  const maxShare = Math.max(...radialData.map((d) => d.sharePct), 10)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center" style={{ minHeight: height }}>
      <div style={{ width: '100%', height: height - 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="52%"
            innerRadius="24%"
            outerRadius="95%"
            barSize={12}
            data={radialData}
            startAngle={210}
            endAngle={-40}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, Math.min(100, Math.ceil(maxShare * 1.15))]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: '#F1F5F9' }}
              dataKey="sharePct"
              cornerRadius={6}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      {/* Ring Legend */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">
          Top Floors Stock Share
        </span>
        {[...radialData].reverse().map((row) => (
          <div
            key={row.name}
            className="px-2.5 py-1.5 rounded-erp border border-surface-border bg-white/80 flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex items-center gap-1.5 min-w-0 font-semibold text-ink truncate">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: row.fill }}
              />
              <span className="truncate">{row.fullName}</span>
            </span>
            <span className="font-mono font-bold text-ink shrink-0">
              {row.stock.toLocaleString()} <span className="text-[10px] text-ink-muted">({row.sharePct}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
