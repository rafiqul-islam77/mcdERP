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
import { AlertTriangle, Clock, Search, ShieldCheck, Flame } from 'lucide-react'
import type { DashboardGroupKey, NonMovingNeedleItem } from '@/lib/dashboard/dashboard-types'

interface NonMovingNeedleSectionProps {
  items: NonMovingNeedleItem[]
  floorSummary: { floorId: string; floorName: string; count: number }[]
  group: DashboardGroupKey
  showRunning?: boolean
  showNew?: boolean
}

function getHeatCellClass(count: number, bucket: '60_89' | '90_119' | '120_plus'): string {
  if (count === 0) return 'bg-slate-100/80 text-slate-400'
  if (bucket === '60_89') {
    return count >= 5
      ? 'bg-amber-400 text-amber-950 font-black'
      : 'bg-amber-200 text-amber-900 font-bold'
  }
  if (bucket === '90_119') {
    return count >= 5
      ? 'bg-orange-500 text-white font-black'
      : 'bg-orange-200 text-orange-950 font-bold'
  }
  return count >= 5
    ? 'bg-rose-600 text-white font-black'
    : 'bg-rose-200 text-rose-950 font-bold'
}

export function NonMovingNeedleSection({
  items,
  floorSummary,
  group,
  showRunning = true,
  showNew = true,
}: NonMovingNeedleSectionProps) {
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = React.useState<string>('ALL')
  const [page, setPage] = React.useState(1)
  const pageSize = 8

  React.useEffect(() => {
    setSelectedCategoryFilter('ALL')
    setPage(1)
  }, [group])

  const scopedItems = React.useMemo(() => {
    return items.filter((it) => {
      if (group === 'NORMAL') {
        if (it.category === 'RUNNING' && !showRunning) return false
        if (it.category === 'NEW' && !showNew) return false
        return it.category === 'RUNNING' || it.category === 'NEW'
      }
      return it.category === 'IDLE'
    })
  }, [items, group, showRunning, showNew])

  const totalItems = scopedItems.length
  const totalStock = scopedItems.reduce((acc, it) => acc + it.currentStock, 0)

  const { chartData, heatmapRows } = React.useMemo(() => {
    const floorBuckets = new Map<
      string,
      {
        floor: string
        count: number
        b60_89: number
        b90_119: number
        b120_plus: number
        stock: number
      }
    >()

    for (const fl of floorSummary) {
      floorBuckets.set(fl.floorId, {
        floor: fl.floorName,
        count: 0,
        b60_89: 0,
        b90_119: 0,
        b120_plus: 0,
        stock: 0,
      })
    }

    for (const it of scopedItems) {
      const existing = floorBuckets.get(it.floorId) || {
        floor: it.floorCode || it.floorName,
        count: 0,
        b60_89: 0,
        b90_119: 0,
        b120_plus: 0,
        stock: 0,
      }
      existing.count += 1
      existing.stock += it.currentStock
      if (it.daysWithoutMovement >= 120) existing.b120_plus += 1
      else if (it.daysWithoutMovement >= 90) existing.b90_119 += 1
      else existing.b60_89 += 1
      floorBuckets.set(it.floorId, existing)
    }

    const activeFloors = Array.from(floorBuckets.values())
      .filter((f) => f.count > 0)
      .sort((a, b) => b.count - a.count)

    return {
      chartData: activeFloors.map((f) => ({ floor: f.floor, count: f.count })),
      heatmapRows: activeFloors.slice(0, 8),
    }
  }, [floorSummary, scopedItems])

  const affectedFloors = chartData.length

  const filteredItems = React.useMemo(() => {
    return scopedItems.filter((it) => {
      if (selectedCategoryFilter !== 'ALL' && it.category !== selectedCategoryFilter) {
        return false
      }
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        it.itemCode.toLowerCase().includes(term) ||
        it.needleType.toLowerCase().includes(term) ||
        it.floorName.toLowerCase().includes(term) ||
        (it.brand && it.brand.toLowerCase().includes(term))
      )
    })
  }, [scopedItems, searchTerm, selectedCategoryFilter])

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1
  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize)

  const barColor = group === 'NORMAL' ? '#2563EB' : '#F59E0B'

  return (
    <div className="space-y-4">
      {/* KPI Overview Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-rose-50/70 border border-rose-200/80 rounded-erp p-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
              {group === 'NORMAL' ? 'Normal Non-Moving Items' : 'Idle Non-Moving Items'}
            </span>
            <div className="text-xl font-black text-rose-900 font-mono mt-0.5">
              {totalItems.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-rose-700">ITEMS</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/80 rounded-erp p-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
              Tied-Up Non-Moving Stock
            </span>
            <div className="text-xl font-black text-amber-900 font-mono mt-0.5">
              {totalStock.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-amber-700">PCS</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-50 border border-surface-border rounded-erp p-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
              Affected Floors
            </span>
            <div className="text-xl font-black text-ink font-mono mt-0.5">
              {affectedFloors}{' '}
              <span className="text-xs font-semibold text-ink-muted">FLOORS</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Visual Row: Horizontal Bar Chart + Aging Intensity Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Horizontal Bar Chart */}
        <div className="bg-slate-50/50 rounded-erp border border-surface-border p-3 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-ink uppercase tracking-wider block mb-0.5">
              NON-MOVING ITEMS BY FLOOR
            </span>
            <span className="text-[10px] text-ink-muted block mb-2">
              Items with stock &gt; 0 and no qualifying movement for &ge; 60 days
            </span>
          </div>

          <div style={{ width: '100%', height: Math.max(220, chartData.length * 28 + 20) }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 32, left: 6, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="floor"
                    tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
                    width={82}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val) => [`${val} non-moving items`, 'Count']}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      color: '#fff',
                      fontSize: '11px',
                      borderRadius: '6px',
                    }}
                  />
                  <Bar dataKey="count" fill={barColor} radius={[0, 5, 5, 0]} maxBarSize={18}>
                    <LabelList
                      dataKey="count"
                      position="right"
                      style={{ fontSize: '10px', fontWeight: 700, fill: '#1E293B' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-ink-muted italic">
                No {group === 'NORMAL' ? 'Normal' : 'Idle'} non-moving items detected ✓
              </div>
            )}
          </div>
        </div>

        {/* Right: Floor × Aging Severity Heatmap */}
        <div className="bg-slate-50/50 rounded-erp border border-surface-border p-3 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className="text-[11px] font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                <span>FLOOR × INACTIVITY SEVERITY</span>
              </span>
              <span className="text-[10px] text-ink-muted block mt-0.5">
                Color intensity reflects item concentration across aging windows
              </span>
            </div>
          </div>

          {heatmapRows.length > 0 ? (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-[11px] border-separate border-spacing-1">
                <thead>
                  <tr className="text-[10px] text-ink-muted uppercase font-bold">
                    <th className="text-left px-1.5 py-1">Floor</th>
                    <th className="text-center px-1.5 py-1">60–89d</th>
                    <th className="text-center px-1.5 py-1">90–119d</th>
                    <th className="text-center px-1.5 py-1">120+d</th>
                    <th className="text-right px-1.5 py-1">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapRows.map((r) => (
                    <tr key={r.floor}>
                      <td className="px-1.5 py-1 font-semibold text-ink truncate max-w-[100px]">
                        {r.floor}
                      </td>
                      <td
                        className={`text-center py-1 rounded ${getHeatCellClass(r.b60_89, '60_89')}`}
                        title={`${r.floor}: ${r.b60_89} items (60–89 days inactive)`}
                      >
                        {r.b60_89}
                      </td>
                      <td
                        className={`text-center py-1 rounded ${getHeatCellClass(r.b90_119, '90_119')}`}
                        title={`${r.floor}: ${r.b90_119} items (90–119 days inactive)`}
                      >
                        {r.b90_119}
                      </td>
                      <td
                        className={`text-center py-1 rounded ${getHeatCellClass(r.b120_plus, '120_plus')}`}
                        title={`${r.floor}: ${r.b120_plus} items (120+ days inactive)`}
                      >
                        {r.b120_plus}
                      </td>
                      <td className="text-right px-1.5 py-1 font-mono font-bold text-ink">
                        {r.stock.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 min-h-[180px] flex items-center justify-center text-xs text-ink-muted italic">
              All authorized floors show healthy movement ✓
            </div>
          )}
        </div>
      </div>

      {/* Detailed Items Table */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search item code, type, floor..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-erp border border-surface-border bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {group === 'NORMAL' && showRunning && showNew && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] text-ink-muted font-medium">Category:</span>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => {
                  setSelectedCategoryFilter(e.target.value)
                  setPage(1)
                }}
                className="text-xs font-semibold px-2 py-1 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none"
              >
                <option value="ALL">All Normal (Regular + New)</option>
                <option value="RUNNING">Regular (Running)</option>
                <option value="NEW">New Needle</option>
              </select>
            </div>
          )}
        </div>

        <div className="border border-surface-border rounded-erp overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-ink-muted font-bold uppercase tracking-wider text-left border-b border-surface-border">
                  <th className="py-2 px-2.5">Floor</th>
                  <th className="py-2 px-2.5">Needle Code</th>
                  <th className="py-2 px-2.5">Type &amp; Brand</th>
                  <th className="py-2 px-2.5">Category</th>
                  <th className="py-2 px-2.5 text-right">Current Stock</th>
                  <th className="py-2 px-2.5 text-center">Last Movement</th>
                  <th className="py-2 px-2.5 text-right">Days Inactive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {paginatedItems.length > 0 ? (
                  paginatedItems.map((item, idx) => (
                    <tr
                      key={`${item.floorId}-${item.category}-${item.needleItemId}-${idx}`}
                      className="hover:bg-slate-50/60"
                    >
                      <td className="py-2 px-2.5 font-medium text-ink">
                        {item.floorCode || item.floorName}
                      </td>
                      <td className="py-2 px-2.5 font-bold font-mono text-ink">
                        {item.itemCode}
                      </td>
                      <td
                        className="py-2 px-2.5 text-ink-muted truncate max-w-[160px]"
                        title={`${item.needleType} (${item.brand})`}
                      >
                        {item.needleType}{' '}
                        <span className="text-[10px] text-slate-400">({item.brand})</span>
                      </td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            item.category === 'RUNNING'
                              ? 'bg-blue-100 text-blue-700'
                              : item.category === 'NEW'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.category === 'RUNNING' ? 'REGULAR' : item.category}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-right font-bold font-mono text-ink">
                        {item.currentStock.toLocaleString()} PCS
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono text-slate-500">
                        {item.lastMovementDate || 'No Recorded Tx'}
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold font-mono">
                          {item.daysWithoutMovement}d
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-muted">
                      No non-moving items match the current search filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-3 py-2 border-t border-surface-border bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-ink-muted">
                Showing {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length} items
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2 py-1 rounded border border-surface-border bg-white text-ink text-xs disabled:opacity-40 font-semibold"
                >
                  Prev
                </button>
                <span className="px-2 text-ink-muted font-mono">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded border border-surface-border bg-white text-ink text-xs disabled:opacity-40 font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
