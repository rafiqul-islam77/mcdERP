'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'

interface ReceiveDeliveryPieChartProps {
  totalReceived: number
  totalDelivery: number
  receivedColor?: string
  deliveryColor?: string
  chartType?: 'donut' | 'pie'
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
          <span>{data.name} (Activity Mix)</span>
        </div>
        <div className="font-mono text-white text-xs">
          {Number(data.value).toLocaleString()} PCS ({data.payload.percentage}%)
        </div>
      </div>
    )
  }
  return null
}

const renderPieLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: any) => {
  if (percent < 0.06) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.56
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={800}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

/**
 * Renders either a Thick-Ring Donut Chart (with central activity readout)
 * or a Solid Pie Chart (with percentage slice labels) for Receive vs Delivered comparison.
 * Explicitly framed as an Activity Mix comparison (not conserved inventory).
 */
export function ReceiveDeliveryPieChart({
  totalReceived,
  totalDelivery,
  receivedColor = '#10B981', // Emerald Green
  deliveryColor = '#2563EB', // Royal Blue
  chartType = 'donut',
  height = 260,
}: ReceiveDeliveryPieChartProps) {
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

  const recvPct = chartData[0]?.percentage ?? 0
  const delPct = chartData[1]?.percentage ?? 0

  return (
    <div className="flex flex-col items-center justify-between h-full" style={{ minHeight: height }}>
      <div style={{ width: '100%', height: height - 66 }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={chartData}
              innerRadius={chartType === 'donut' ? '56%' : 0}
              outerRadius="84%"
              paddingAngle={chartType === 'donut' ? 4 : 1}
              stroke="#ffffff"
              strokeWidth={2}
              dataKey="value"
              label={chartType === 'pie' ? renderPieLabel : false}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {chartType === 'donut' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] uppercase font-bold text-ink-muted tracking-wider">
              Activity Mix
            </span>
            <span className="text-base font-black text-ink font-mono">
              {sum.toLocaleString()}
            </span>
            <span className="text-[9px] font-semibold text-ink-muted">PCS</span>
          </div>
        )}
      </div>

      {/* Metrics Footer with Exact Quantities & Percentages */}
      <div className="w-full grid grid-cols-2 gap-2 pt-2 border-t border-surface-border text-center">
        <div className="p-1.5 rounded-erp bg-white/80 border border-surface-border">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-ink-muted">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: receivedColor }}
            />
            <span>RECEIVED ({recvPct}%)</span>
          </div>
          <div className="text-xs font-black text-ink mt-0.5 font-mono">
            {totalReceived.toLocaleString()}{' '}
            <span className="text-[9px] font-normal text-ink-muted">PCS</span>
          </div>
        </div>

        <div className="p-1.5 rounded-erp bg-white/80 border border-surface-border">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-ink-muted">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: deliveryColor }}
            />
            <span>DELIVERED ({delPct}%)</span>
          </div>
          <div className="text-xs font-black text-ink mt-0.5 font-mono">
            {totalDelivery.toLocaleString()}{' '}
            <span className="text-[9px] font-normal text-ink-muted">PCS</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export { ReceiveDeliveryPieChart as ReceiveDeliveryDonut }
