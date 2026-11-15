'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'

interface ReceiveDeliveryDonutProps {
  totalReceived: number
  totalDelivery: number
  receivedColor?: string
  deliveryColor?: string
  height?: number
  title?: string
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]
    return (
      <div className="bg-slate-900 text-white p-2 rounded-erp border border-slate-700 shadow-md text-xs space-y-1">
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

export function ReceiveDeliveryDonut({
  totalReceived,
  totalDelivery,
  receivedColor = '#10B981', // Green
  deliveryColor = '#F97316', // Orange
  height = 240,
}: ReceiveDeliveryDonutProps) {
  const sum = totalReceived + totalDelivery
  const hasData = sum > 0

  const chartData = React.useMemo(() => {
    if (!hasData) return []
    const recvPct = Math.round((totalReceived / sum) * 1000) / 10
    const delPct = Math.round((totalDelivery / sum) * 1000) / 10

    return [
      { name: 'Received', value: totalReceived, percentage: recvPct, fill: receivedColor },
      { name: 'Delivered', value: totalDelivery, percentage: delPct, fill: deliveryColor },
    ]
  }, [totalReceived, totalDelivery, sum, hasData, receivedColor, deliveryColor])

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center text-xs text-ink-muted bg-slate-50/50 rounded-erp border border-dashed border-surface-border p-4"
      >
        <span>No transactions recorded</span>
        <span className="text-[10px] text-slate-400 mt-1">Received: 0 • Delivered: 0</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-between h-full" style={{ minHeight: height }}>
      {/* Chart */}
      <div style={{ width: '100%', height: height - 60 }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={chartData}
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={3}
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
            Total Activity
          </span>
          <span className="text-base font-black text-ink">
            {sum.toLocaleString()}
          </span>
          <span className="text-[9px] font-semibold text-ink-muted">PCS</span>
        </div>
      </div>

      {/* Legend / Metrics Footer */}
      <div className="w-full grid grid-cols-2 gap-2 pt-2 border-t border-surface-border text-center">
        <div className="p-1.5 rounded-erp bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>RECEIVED</span>
          </div>
          <div className="text-xs font-black text-ink mt-0.5 font-mono">
            {totalReceived.toLocaleString()} <span className="text-[9px] font-normal text-ink-muted">PCS</span>
          </div>
        </div>

        <div className="p-1.5 rounded-erp bg-orange-50/60 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-orange-700 dark:text-orange-400">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span>DELIVERED</span>
          </div>
          <div className="text-xs font-black text-ink mt-0.5 font-mono">
            {totalDelivery.toLocaleString()} <span className="text-[9px] font-normal text-ink-muted">PCS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
