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
    const fullName = payload[0]?.payload?.fullName || label
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-erp border border-slate-700 shadow-lg text-xs space-y-1">
        <div className="font-bold border-b border-slate-800 pb-1 text-slate-200">
          {fullName}
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
  receivedColor = '#10B981', // Emerald Green
  deliveryColor = '#2563EB', // Vibrant Blue
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
          barGap={4}
          barCategoryGap="22%"
          margin={{ top: 10, right: 12, left: -12, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#64748B', fontWeight: 500 }}
            interval={0}
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
            wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 600 }}
          />
          <Bar
            dataKey="Received"
            fill={receivedColor}
            radius={[5, 5, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="Delivered"
            fill={deliveryColor}
            radius={[5, 5, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
