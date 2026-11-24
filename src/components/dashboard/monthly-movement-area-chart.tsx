'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { MonthlyClosingStockPoint } from '@/lib/dashboard/dashboard-types'

interface MonthlyMovementAreaChartProps {
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
          {label} (Monthly Movement)
        </div>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
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
 * Area Graph showing 12-month Receive vs Delivered volume trend.
 * Strictly separated between Normal Needle and Idle Needle.
 */
export function MonthlyMovementAreaChart({
  trendPoints,
  mode,
  normalSubCategory = 'ALL_NORMAL',
  height = 260,
}: MonthlyMovementAreaChartProps) {
  const receivedColor = mode === 'NORMAL' ? '#10B981' : '#0D9488'
  const deliveryColor = mode === 'NORMAL' ? '#2563EB' : '#F97316'
  const recvGradId = mode === 'NORMAL' ? 'normRecvAreaGrad' : 'idleRecvAreaGrad'
  const delGradId = mode === 'NORMAL' ? 'normDelAreaGrad' : 'idleDelAreaGrad'

  const chartData = React.useMemo(() => {
    return trendPoints.map((pt) => {
      if (mode === 'IDLE') {
        return {
          name: pt.monthLabel,
          Received: pt.idleReceived,
          Delivered: pt.idleDelivery,
        }
      }
      if (normalSubCategory === 'RUNNING') {
        return {
          name: pt.monthLabel,
          Received: pt.runningReceived,
          Delivered: pt.runningDelivery,
        }
      }
      if (normalSubCategory === 'NEW') {
        return {
          name: pt.monthLabel,
          Received: pt.newReceived,
          Delivered: pt.newDelivery,
        }
      }
      return {
        name: pt.monthLabel,
        Received: pt.normalReceived,
        Delivered: pt.normalDelivery,
      }
    })
  }, [trendPoints, mode, normalSubCategory])

  const hasData = chartData.some((d) => d.Received > 0 || d.Delivered > 0)

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border"
      >
        <span>No historical movement volume recorded for this group</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 16, left: -12, bottom: 25 }}
        >
          <defs>
            <linearGradient id={recvGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={receivedColor} stopOpacity={0.34} />
              <stop offset="95%" stopColor={receivedColor} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={delGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={deliveryColor} stopOpacity={0.28} />
              <stop offset="95%" stopColor={deliveryColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
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
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="Received"
            stroke={receivedColor}
            strokeWidth={2.25}
            fillOpacity={1}
            fill={`url(#${recvGradId})`}
          />
          <Area
            type="monotone"
            dataKey="Delivered"
            stroke={deliveryColor}
            strokeWidth={2.25}
            fillOpacity={1}
            fill={`url(#${delGradId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
