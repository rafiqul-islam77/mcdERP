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
import type { FloorReceiveDeliveryItem } from '@/lib/dashboard/dashboard-types'

interface FloorReceiveDeliveryChartProps {
  items: FloorReceiveDeliveryItem[]
  receivedColor?: string
  deliveryColor?: string
  height?: number
  emptyMessage?: string
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1">
        <div className="font-bold border-b border-slate-800 pb-1 text-slate-200">
          {label}
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

export function FloorReceiveDeliveryChart({
  items,
  receivedColor = '#10B981', // Emerald green
  deliveryColor = '#F97316', // Orange
  height = 280,
  emptyMessage = 'No activity recorded for this period',
}: FloorReceiveDeliveryChartProps) {
  const chartData = React.useMemo(() => {
    return items.map((it) => ({
      name: it.floorCode || it.floorName,
      fullName: it.floorName,
      Received: it.received,
      Delivered: it.delivery,
    }))
  }, [items])

  const hasData = chartData.some((d) => d.Received > 0 || d.Delivered > 0)

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>{emptyMessage}</span>
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
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
          />
          <Bar
            dataKey="Received"
            fill={receivedColor}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
          <Bar
            dataKey="Delivered"
            fill={deliveryColor}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
