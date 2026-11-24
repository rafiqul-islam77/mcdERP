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
import { AlertTriangle, Clock, Search, ShieldCheck } from 'lucide-react'
import type { DashboardGroupKey, NonMovingNeedleItem } from '@/lib/dashboard/dashboard-types'

interface NonMovingNeedleSectionProps {
  items: NonMovingNeedleItem[]
  floorSummary: { floorId: string; floorName: string; count: number }[]
  group: DashboardGroupKey
  showRunning?: boolean
  showNew?: boolean
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

  // Reset sub-filter and pagination when switching groups
  React.useEffect(() => {
    setSelectedCategoryFilter('ALL')
    setPage(1)
  }, [group])

  // Apply group/sub-category visibility filter
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

  // Calculate totals strictly from scoped items
  const totalItems = scopedItems.length
  const totalStock = scopedItems.reduce((acc, it) => acc + it.currentStock, 0)

  const chartData = React.useMemo(() => {
    const counts = new Map<string, { floor: string; count: number }>()
    for (const fl of floorSummary) {
      counts.set(fl.floorId, { floor: fl.floorName, count: 0 })
    }
    for (const it of scopedItems) {
      const existing = counts.get(it.floorId) || { floor: it.floorName, count: 0 }
      existing.count += 1
      counts.set(it.floorId, existing)
    }
    return Array.from(counts.values())
      .filter((f) => f.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [floorSummary, scopedItems])

  const affectedFloors = chartData.length

  // Filter items for table
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

      {/* Main Grid: Horizontal Bar Chart + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-50/40 rounded-erp border border-surface-border p-3 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-ink uppercase tracking-wider block mb-1">
              NON-MOVING ITEMS BY FLOOR
            </span>
            <span className="text-[10px] text-ink-muted block mb-3">
              Items with balance &gt; 0 and no qualifying movements for &ge; 60 days
            </span>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
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
                    tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
                    width={85}
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
                  <Bar
                    dataKey="count"
                    fill={barColor}
                    radius={[0, 5, 5, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-ink-muted italic">
                No {group === 'NORMAL' ? 'Normal' : 'Idle'} non-moving items detected ✓
              </div>
            )}
          </div>
        </div>

        {/* Detailed Items Table */}
        <div className="lg:col-span-2 space-y-2">
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
                          className="py-2 px-2.5 text-ink-muted truncate max-w-[140px]"
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
    </div>
  )
}
