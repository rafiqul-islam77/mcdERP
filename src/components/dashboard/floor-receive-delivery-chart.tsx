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
  LabelList,
} from 'recharts'
import type { FloorReceiveDeliveryItem } from '@/lib/dashboard/dashboard-types'
import { formatCompactChartNumber } from './chart-formatters'

interface FloorReceiveDeliveryChartProps {
  items: FloorReceiveDeliveryItem[]
  receivedColor?: string
  receivedGradientTo?: string
  deliveryColor?: string
  deliveryGradientTo?: string
  orientation?: 'vertical' | 'horizontal'
  useGradient?: boolean
  showDataLabels?: boolean
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
                style={{ backgroundColor: entry.payload?.__colors?.[entry.dataKey] || entry.color }}
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
 * Versatile Grouped Bar / Horizontal Comparison Bar chart for Floor-wise Receive & Delivery.
 * Supports both Vertical Grouped Columns and Horizontal Grouped Bars with direct data labels.
 */
export function FloorReceiveDeliveryChart({
  items,
  receivedColor = '#10B981', // Emerald Green
  receivedGradientTo = '#059669',
  deliveryColor = '#2563EB', // Royal Blue
  deliveryGradientTo = '#1D4ED8',
  orientation = 'vertical',
  useGradient = false,
  showDataLabels = true,
  height = 290,
  emptyMessage = 'No activity recorded for this period',
}: FloorReceiveDeliveryChartProps) {
  const uid = React.useId().replace(/:/g, '')
  const recvGradId = `recvGrad-${uid}`
  const delGradId = `delGrad-${uid}`

  const chartData = React.useMemo(() => {
    return items.map((it) => ({
      name: it.floorCode || it.floorName,
      fullName: it.floorName,
      Received: it.received,
      Delivered: it.delivery,
      __colors: { Received: receivedColor, Delivered: deliveryColor },
    }))
  }, [items, receivedColor, deliveryColor])

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

  const recvFill = useGradient ? `url(#${recvGradId})` : receivedColor
  const delFill = useGradient ? `url(#${delGradId})` : deliveryColor

  if (orientation === 'horizontal') {
    const activeItems = chartData.filter((d) => d.Received > 0 || d.Delivered > 0)
    const displayData = activeItems.length > 0 ? activeItems : chartData
    const dynamicHeight = Math.max(height, displayData.length * 36 + 56)

    return (
      <div style={{ width: '100%', height: dynamicHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayData}
            layout="vertical"
            barGap={3}
            barCategoryGap="24%"
            margin={{ top: 8, right: 44, left: 6, bottom: 8 }}
          >
            {useGradient && (
              <defs>
                <linearGradient id={recvGradId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={receivedColor} />
                  <stop offset="100%" stopColor={receivedGradientTo} />
                </linearGradient>
                <linearGradient id={delGradId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={deliveryColor} />
                  <stop offset="100%" stopColor={deliveryGradientTo} />
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
            <Legend
              verticalAlign="top"
              align="right"
              iconType="square"
              iconSize={9}
              wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontWeight: 600 }}
            />
            <Bar
              dataKey="Received"
              fill={recvFill}
              radius={[0, 5, 5, 0]}
              maxBarSize={14}
            >
              {showDataLabels && (
                <LabelList
                  dataKey="Received"
                  position="right"
                  formatter={formatCompactChartNumber}
                  style={{ fontSize: '9.5px', fontWeight: 700, fill: '#334155' }}
                />
              )}
            </Bar>
            <Bar
              dataKey="Delivered"
              fill={delFill}
              radius={[0, 5, 5, 0]}
              maxBarSize={14}
            >
              {showDataLabels && (
                <LabelList
                  dataKey="Delivered"
                  position="right"
                  formatter={formatCompactChartNumber}
                  style={{ fontSize: '9.5px', fontWeight: 700, fill: '#334155' }}
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
          barGap={4}
          barCategoryGap="20%"
          margin={{ top: 22, right: 12, left: -12, bottom: 26 }}
        >
          {useGradient && (
            <defs>
              <linearGradient id={recvGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={receivedColor} />
                <stop offset="100%" stopColor={receivedGradientTo} />
              </linearGradient>
              <linearGradient id={delGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={deliveryColor} />
                <stop offset="100%" stopColor={deliveryGradientTo} />
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
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingBottom: '14px', fontSize: '11px', fontWeight: 600 }}
          />
          <Bar
            dataKey="Received"
            fill={recvFill}
            radius={[5, 5, 0, 0]}
            maxBarSize={26}
          >
            {showDataLabels && (
              <LabelList
                dataKey="Received"
                position="top"
                formatter={formatCompactChartNumber}
                style={{ fontSize: '9.5px', fontWeight: 700, fill: '#1E293B' }}
              />
            )}
          </Bar>
          <Bar
            dataKey="Delivered"
            fill={delFill}
            radius={[5, 5, 0, 0]}
            maxBarSize={26}
          >
            {showDataLabels && (
              <LabelList
                dataKey="Delivered"
                position="top"
                formatter={formatCompactChartNumber}
                style={{ fontSize: '9.5px', fontWeight: 700, fill: '#1E293B' }}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
