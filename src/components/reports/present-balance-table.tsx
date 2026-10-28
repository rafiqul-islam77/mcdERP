'use client'

import React from 'react'
import type { DailyReportData, DailyReportRowItem } from '@/types'

interface PresentBalanceTableProps {
  report: DailyReportData
  searchQuery?: string
}

export function PresentBalanceTable({ report, searchQuery = '' }: PresentBalanceTableProps) {
  const query = searchQuery.trim().toLowerCase()

  // Filter rows based on search query
  const filteredRows = React.useMemo(() => {
    if (!query) return report.rows
    return report.rows.filter((r) => {
      const codeMatch = r.item_code?.toLowerCase().includes(query)
      const typeMatch = r.needle_type?.toLowerCase().includes(query)
      const sizeMatch = (r.size_dia || '').toLowerCase().includes(query)
      const brandMatch = r.brand?.toLowerCase().includes(query)
      const reqMatch = (r.req_no || '').toLowerCase().includes(query)
      const noteMatch = (r.note || '').toLowerCase().includes(query)
      return codeMatch || typeMatch || sizeMatch || brandMatch || reqMatch || noteMatch
    })
  }, [report.rows, query])

  // Recalculate totals for visible rows if filtered, otherwise use report summary
  const summary = React.useMemo(() => {
    if (!query) return report.summary
    let totalPrevious = 0
    let totalReceived = 0
    let totalDelivery = 0
    let totalPresent = 0
    let totalBnr = 0

    for (const r of filteredRows) {
      totalPrevious += r.previous
      totalReceived += r.received
      totalDelivery += r.delivery
      totalPresent += r.present
      totalBnr += r.bnr
    }

    return { totalPrevious, totalReceived, totalDelivery, totalPresent, totalBnr }
  }, [filteredRows, query, report.summary])

  if (filteredRows.length === 0) {
    return (
      <div className="border border-surface-border rounded-erp bg-surface p-8 text-center text-ink-muted">
        {query ? 'No needle records matching your search.' : 'No needle records found for this Floor and Category.'}
      </div>
    )
  }

  return (
    <div className="border border-surface-border rounded-erp bg-surface overflow-hidden shadow-sm">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-slate-900 text-white font-semibold border-b border-surface-border select-none">
              <th className="py-2.5 px-3 text-center w-12 border-r border-slate-800">SL</th>
              <th className="py-2.5 px-3 text-center w-24 border-r border-slate-800">CODE</th>
              <th className="py-2.5 px-3.5 border-r border-slate-800">TYPE</th>
              <th className="py-2.5 px-3 text-center w-16 border-r border-slate-800">SIZE</th>
              <th className="py-2.5 px-3 text-center w-24 border-r border-slate-800">BRAND</th>
              <th className="py-2.5 px-3 text-right w-24 border-r border-slate-800">UNIT PRICE</th>
              <th className="py-2.5 px-3 text-right w-20 border-r border-slate-800">PREVIOUS</th>
              <th className="py-2.5 px-3 text-right w-20 border-r border-slate-800">RECEIVED</th>
              <th className="py-2.5 px-3 text-center w-36 border-r border-slate-800">REQ NO</th>
              <th className="py-2.5 px-3 text-right w-20 border-r border-slate-800">DELIVERY</th>
              <th className="py-2.5 px-3 text-right w-28 border-r border-slate-800 bg-slate-800 text-amber-300">
                PRESENT BALANCE
              </th>
              <th className="py-2.5 px-3 text-right w-16 border-r border-slate-800">BNR</th>
              <th className="py-2.5 px-3">NOTE / SOURCE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {filteredRows.map((row: DailyReportRowItem, idx: number) => (
              <tr
                key={row.needle_item_id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td className="py-2 px-3 text-center font-mono text-ink-muted border-r border-surface-border/60">
                  {idx + 1}
                </td>
                <td className="py-2 px-3 text-center font-mono font-medium text-brand border-r border-surface-border/60">
                  {row.item_code}
                </td>
                <td className="py-2 px-3.5 font-medium text-ink border-r border-surface-border/60">
                  {row.needle_type}
                </td>
                <td className="py-2 px-3 text-center text-ink-muted border-r border-surface-border/60">
                  {row.size_dia || '—'}
                </td>
                <td className="py-2 px-3 text-center text-ink-muted border-r border-surface-border/60">
                  {row.brand}
                </td>
                <td className="py-2 px-3 text-right font-mono text-ink-muted border-r border-surface-border/60">
                  {row.unit_price_usd !== null && row.unit_price_usd !== undefined
                    ? `$${Number(row.unit_price_usd).toFixed(4)}`
                    : '—'}
                </td>
                <td className="py-2 px-3 text-right font-mono text-ink border-r border-surface-border/60">
                  {row.previous.toLocaleString()}
                </td>
                <td className="py-2 px-3 text-right font-mono font-medium text-success border-r border-surface-border/60">
                  {row.received > 0 ? `+${row.received.toLocaleString()}` : '0'}
                </td>
                <td className="py-2 px-3 text-center font-mono text-[11px] text-ink-muted border-r border-surface-border/60 truncate max-w-[140px]">
                  {row.req_no || '—'}
                </td>
                <td className="py-2 px-3 text-right font-mono font-medium text-danger border-r border-surface-border/60">
                  {row.delivery > 0 ? `-${row.delivery.toLocaleString()}` : '0'}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/30 border-r border-surface-border/60">
                  {row.present.toLocaleString()}
                </td>
                <td className="py-2 px-3 text-right font-mono text-ink border-r border-surface-border/60">
                  {row.bnr.toLocaleString()}
                </td>
                <td className="py-2 px-3 text-ink-muted truncate max-w-[200px]">
                  {row.note || '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 dark:bg-slate-800/80 font-bold text-ink border-t-2 border-slate-300 dark:border-slate-700 select-none">
              <td colSpan={6} className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300 border-r border-surface-border">
                TOTAL →
              </td>
              <td className="py-2.5 px-3 text-right font-mono border-r border-surface-border">
                {summary.totalPrevious.toLocaleString()}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-success border-r border-surface-border">
                {summary.totalReceived.toLocaleString()}
              </td>
              <td className="py-2.5 px-3 border-r border-surface-border" />
              <td className="py-2.5 px-3 text-right font-mono text-danger border-r border-surface-border">
                {summary.totalDelivery.toLocaleString()}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/60 border-r border-surface-border">
                {summary.totalPresent.toLocaleString()}
              </td>
              <td className="py-2.5 px-3 text-right font-mono border-r border-surface-border">
                {summary.totalBnr.toLocaleString()}
              </td>
              <td className="py-2.5 px-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
