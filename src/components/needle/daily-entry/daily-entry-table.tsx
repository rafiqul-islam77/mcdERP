'use client'

import * as React from 'react'
import { AlertCircle, ArrowRightLeft, Layers, WifiOff } from 'lucide-react'
import type { DailyEntryRowItem } from '@/types'

const EDITABLE_FIELDS = ['received', 'delivery', 'bnr'] as const
type EditableField = typeof EDITABLE_FIELDS[number]

interface DailyEntryTableProps {
  rows: DailyEntryRowItem[]
  loading: boolean
  offlineNoCache?: boolean
  coverageIncomplete?: boolean
  coverageMessage?: string | null
  sheetKey?: string
  onCellChange: (
    needleItemId: string,
    field: 'received' | 'delivery' | 'bnr',
    value: number
  ) => void
  onOpenTransfer: (item: DailyEntryRowItem) => void
  onEditReqNo?: (item: DailyEntryRowItem) => void
}

export function DailyEntryTable({
  rows,
  loading,
  offlineNoCache = false,
  coverageIncomplete = false,
  coverageMessage,
  sheetKey,
  onCellChange,
  onOpenTransfer,
  onEditReqNo,
}: DailyEntryTableProps) {
  // Local state for snappy typing before debounced/blur server save
  const [localEdits, setLocalEdits] = React.useState<
    Record<string, { received?: string; delivery?: string; bnr?: string }>
  >({})
  const [validationError, setValidationError] = React.useState<{
    needleItemId: string
    message: string
  } | null>(null)
  const validationTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  const showValidationError = React.useCallback(
    (needleItemId: string, message: string) => {
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current)
      }
      setValidationError({ needleItemId, message })
      validationTimerRef.current = setTimeout(() => {
        setValidationError(null)
        validationTimerRef.current = null
      }, 5000)
    },
    []
  )

  React.useEffect(() => {
    return () => {
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current)
      }
    }
  }, [])

  // Clear local typing state & validation errors when date, floor, or category changes so inputs never carry over
  React.useEffect(() => {
    setLocalEdits({})
    setValidationError(null)
  }, [sheetKey])

  // Compute column totals
  const totals = React.useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.prev += r.previous ?? 0
        acc.rcvd += r.received ?? 0
        acc.dvld += r.delivery ?? 0
        acc.present += r.present ?? 0
        acc.bnr += r.bnr ?? 0
        return acc
      },
      { prev: 0, rcvd: 0, dvld: 0, present: 0, bnr: 0 }
    )
  }, [rows])

  const handleInputChange = (
    needleItemId: string,
    field: EditableField,
    valStr: string
  ) => {
    if (validationError?.needleItemId === needleItemId && field === 'delivery') {
      setValidationError(null)
    }
    // Only update local input state while typing so that multi-digit entries aren't interrupted
    setLocalEdits((prev) => ({
      ...prev,
      [needleItemId]: {
        ...prev[needleItemId],
        [field]: valStr,
      },
    }))
  }

  const handleBlur = (
    needleItemId: string,
    field: EditableField,
    currentSavedValue: number
  ) => {
    const editStr = localEdits[needleItemId]?.[field]
    if (editStr !== undefined) {
      const valNum = editStr === '' ? 0 : Number(editStr)
      if (!isNaN(valNum) && valNum >= 0) {
        // Validation check for delivery
        if (field === 'delivery') {
          const row = rows.find((r) => r.needle_item_id === needleItemId)
          if (row) {
            const effectiveRcvd =
              localEdits[needleItemId]?.received !== undefined
                ? (localEdits[needleItemId].received === '' ? 0 : Number(localEdits[needleItemId].received))
                : (row.received || 0)
            const availableStock = Math.max(
              0,
              (row.previous || 0) + (effectiveRcvd || 0) + (row.transfer_in || 0) - (row.transfer_out || 0)
            )

            if (valNum > availableStock) {
              showValidationError(
                needleItemId,
                `Delivery cannot exceed available stock (${availableStock}).`
              )
              // Reset local edits back to last saved value
              setLocalEdits((prev) => ({
                ...prev,
                [needleItemId]: {
                  ...prev[needleItemId],
                  delivery: currentSavedValue > 0 ? String(currentSavedValue) : '',
                },
              }))
              return
            }
          }
        }

        if (validationError?.needleItemId === needleItemId) {
          setValidationError(null)
        }

        if (valNum !== currentSavedValue) {
          onCellChange(needleItemId, field, valNum)
        }
      } else {
        // Reset to last saved value
        setLocalEdits((prev) => ({
          ...prev,
          [needleItemId]: {
            ...prev[needleItemId],
            [field]: currentSavedValue > 0 ? String(currentSavedValue) : '',
          },
        }))
      }
    }
  }

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: EditableField
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      const nextIndex = rowIndex + 1
      e.currentTarget.blur()
      if (nextIndex < rows.length) {
        e.preventDefault()
        setTimeout(() => {
          if (document.querySelector('[role="dialog"]')) {
            return
          }
          const nextInput = document.querySelector<HTMLInputElement>(
            `input[data-field="${field}"][data-row-index="${nextIndex}"]`
          )
          if (nextInput) {
            nextInput.focus()
            nextInput.select()
          }
        }, 50)
      }
    } else if (e.key === 'ArrowUp') {
      const prevIndex = rowIndex - 1
      if (prevIndex >= 0) {
        e.preventDefault()
        e.currentTarget.blur()
        setTimeout(() => {
          const prevInput = document.querySelector<HTMLInputElement>(
            `input[data-field="${field}"][data-row-index="${prevIndex}"]`
          )
          if (prevInput) {
            prevInput.focus()
            prevInput.select()
          }
        }, 30)
      }
    } else if (e.key === 'ArrowRight') {
      const colIdx = EDITABLE_FIELDS.indexOf(field)
      if (colIdx < EDITABLE_FIELDS.length - 1) {
        e.preventDefault()
        e.currentTarget.blur()
        const nextField = EDITABLE_FIELDS[colIdx + 1]
        setTimeout(() => {
          const nextInput = document.querySelector<HTMLInputElement>(
            `input[data-field="${nextField}"][data-row-index="${rowIndex}"]`
          )
          if (nextInput) {
            nextInput.focus()
            nextInput.select()
          }
        }, 30)
      }
    } else if (e.key === 'ArrowLeft') {
      const colIdx = EDITABLE_FIELDS.indexOf(field)
      if (colIdx > 0) {
        e.preventDefault()
        e.currentTarget.blur()
        const prevField = EDITABLE_FIELDS[colIdx - 1]
        setTimeout(() => {
          const prevInput = document.querySelector<HTMLInputElement>(
            `input[data-field="${prevField}"][data-row-index="${rowIndex}"]`
          )
          if (prevInput) {
            prevInput.focus()
            prevInput.select()
          }
        }, 30)
      }
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-erp p-3">
        <div className="space-y-1">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="h-6 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    if (coverageIncomplete || offlineNoCache) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 rounded-erp p-8 text-center text-slate-500 space-y-2">
          <WifiOff className="w-8 h-8 mx-auto text-amber-500" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Connect to network to load stock data for this date.
          </p>
          <p className="text-[11px] text-slate-400">
            Stock history for this date is not completely available offline.
          </p>
        </div>
      )
    }

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-erp p-8 text-center text-slate-500 space-y-1.5">
        <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          No needles assigned to this floor.
        </p>
        <p className="text-[11px] text-slate-400">
          Assign needles to this floor in Needle Management master data to populate this sheet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 w-full">
      {coverageIncomplete && (
        <div className="p-2.5 px-3 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-medium">
            {coverageMessage || 'Connect to network to load stock data for this date.'}
          </span>
        </div>
      )}
      {validationError && (
        <div className="p-2 px-3 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="font-medium">{validationError.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 font-bold ml-2 text-sm leading-none cursor-pointer"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded shadow-xs overflow-hidden w-full">
      {/* 100% in-view table without horizontal scrolling/sliding */}
      <table className="w-full table-fixed border-collapse text-xs">
        {/* Compact Column Widths totaling 100% */}
        <colgroup>
          <col className="w-[7%]" />
          <col className="w-[25%]" />
          <col className="w-[6%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[6%]" />
        </colgroup>

        {/* Spreadsheet Header */}
        <thead className="bg-[#1e293b] text-white">
          <tr className="bg-[#1e293b] text-white uppercase text-[8px] sm:text-[10px] font-bold select-none border-b border-slate-700 leading-tight">
            <th className="py-1 px-0.5 sm:px-1.5 text-center sm:text-left border-r border-slate-700 bg-[#1e293b] text-white overflow-hidden">
              CODE
            </th>
            <th className="py-1 px-1 text-left border-r border-slate-700 bg-[#1e293b] text-white overflow-hidden">
              TYPE
            </th>
            <th className="py-1 px-0.5 text-center border-r border-slate-700 bg-[#1e293b] text-white overflow-hidden">
              SIZE
            </th>
            <th
              className="py-1 px-0.5 text-center border-r border-slate-700 bg-[#1e293b] text-white overflow-hidden"
              title="Brand"
            >
              <span className="hidden sm:inline">BRAND</span>
              <span className="sm:hidden">BRD</span>
            </th>
            <th
              className="py-1 px-0.5 text-center border-r border-slate-700 bg-[#1e293b] text-slate-200 overflow-hidden"
              title="Previous Balance"
            >
              PREV
            </th>
            <th className="py-1 px-0.5 text-center border-r border-slate-700 bg-[#1e293b] text-emerald-300 overflow-hidden">
              RCVD
            </th>
            <th className="py-1 px-0.5 text-center border-r border-slate-700 bg-[#1e293b] text-blue-300 overflow-hidden">
              DVLD
            </th>
            <th className="py-1 px-0.5 text-center border-r border-slate-700 bg-[#1e293b] text-amber-300 overflow-hidden">
              <span className="hidden sm:inline">PRESENT</span>
              <span className="sm:hidden">PRES</span>
            </th>
            <th className="py-1 px-0.5 text-center border-r border-slate-700 bg-[#1e293b] text-purple-300 overflow-hidden">
              BNR
            </th>
            <th className="py-1 px-0.5 text-center bg-[#1e293b] text-white overflow-hidden" title="Transfer">
              <ArrowRightLeft className="w-3 h-3 mx-auto" />
            </th>
          </tr>
        </thead>

        {/* Spreadsheet Rows */}
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[11px]">
          {rows.map((row, idx) => {
            const edits = localEdits[row.needle_item_id] || {}
            const rcvdDisplay =
              edits.received !== undefined
                ? edits.received
                : row.received > 0
                ? String(row.received)
                : ''
            const dvldDisplay =
              edits.delivery !== undefined
                ? edits.delivery
                : row.delivery > 0
                ? String(row.delivery)
                : ''
            const bnrDisplay =
              edits.bnr !== undefined
                ? edits.bnr
                : row.bnr > 0
                ? String(row.bnr)
                : ''

            const isNegative = row.present < 0

            return (
              <tr
                key={row.needle_item_id}
                className={`hover:bg-amber-50/40 dark:hover:bg-slate-800/50 transition-colors ${
                  idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-900/40' : 'bg-white dark:bg-slate-900'
                }`}
              >
                {/* CODE - last 3 digits on mobile, full code on desktop */}
                <td className="py-0.5 px-0.5 sm:px-1.5 font-bold text-center sm:text-left text-brand dark:text-blue-400 border-r border-slate-200 dark:border-slate-800">
                  <span className="block font-mono text-[10px] sm:text-xs truncate" title={row.item_code}>
                    <span className="inline sm:hidden">{row.item_code.slice(-3)}</span>
                    <span className="hidden sm:inline">{row.item_code}</span>
                  </span>
                </td>

                {/* TYPE - fully shown */}
                <td
                  className="py-0.5 px-1 font-sans text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 text-[9.5px] sm:text-[11px] whitespace-normal break-words leading-tight"
                  title={row.needle_type}
                >
                  {row.needle_type}
                </td>

                {/* SIZE */}
                <td className="py-0.5 px-0.5 text-center font-sans text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 text-[9.5px] sm:text-[10px]">
                  {row.size_dia || '-'}
                </td>

                {/* BRAND - small */}
                <td
                  className="py-0.5 px-0.5 text-center font-sans text-slate-600 dark:text-slate-400 truncate overflow-hidden border-r border-slate-200 dark:border-slate-800 text-[8.5px] sm:text-[10px]"
                  title={row.brand}
                >
                  {row.brand}
                </td>

                {/* PREV (Read-only calculated) */}
                <td className="py-0.5 px-0.5 text-center font-bold text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-950/40 border-r border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs">
                  {coverageIncomplete || row.is_stock_known === false ? '—' : row.previous}
                </td>

                {/* RCVD (Editable input) */}
                <td className="py-0.5 px-0.5 text-center border-r border-slate-200 dark:border-slate-800">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    disabled={coverageIncomplete || row.is_stock_known === false}
                    data-field="received"
                    data-row-index={idx}
                    value={rcvdDisplay}
                    onChange={(e) =>
                      handleInputChange(row.needle_item_id, 'received', e.target.value)
                    }
                    onBlur={() =>
                      handleBlur(row.needle_item_id, 'received', row.received)
                    }
                    onKeyDown={(e) => handleKeyDown(e, idx, 'received')}
                    className="w-full h-6 py-0 px-0.5 text-center rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-[11px] sm:text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {row.req_no && (
                    <button
                      type="button"
                      onClick={() => onEditReqNo?.(row)}
                      title={`Click to edit requisition number: ${row.req_no}`}
                      className="mt-0.5 block w-full text-center text-[7.5px] sm:text-[8.5px] font-sans text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 hover:underline font-semibold truncate leading-tight cursor-pointer"
                    >
                      <span className="truncate">{row.req_no}</span>
                    </button>
                  )}
                </td>

                {/* DVLD (Editable input) */}
                <td className="py-0.5 px-0.5 text-center border-r border-slate-200 dark:border-slate-800">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    disabled={coverageIncomplete || row.is_stock_known === false}
                    data-field="delivery"
                    data-row-index={idx}
                    value={dvldDisplay}
                    onChange={(e) =>
                      handleInputChange(row.needle_item_id, 'delivery', e.target.value)
                    }
                    onBlur={() =>
                      handleBlur(row.needle_item_id, 'delivery', row.delivery)
                    }
                    onKeyDown={(e) => handleKeyDown(e, idx, 'delivery')}
                    className={`w-full h-6 py-0 px-0.5 text-center rounded border font-bold focus:outline-none focus:ring-1 text-[11px] sm:text-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                      validationError?.needleItemId === row.needle_item_id
                        ? 'border-rose-500 dark:border-rose-600 bg-rose-50/50 dark:bg-rose-950/40 text-rose-950 dark:text-rose-200 focus:ring-rose-500 ring-1 ring-rose-500'
                        : 'border-blue-300 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20 text-blue-950 dark:text-blue-200 focus:ring-blue-500'
                    }`}
                  />
                  {validationError?.needleItemId === row.needle_item_id && (
                    <span
                      className="mt-0.5 block w-full text-center text-[7.5px] sm:text-[8.5px] font-sans text-rose-600 dark:text-rose-400 font-bold truncate leading-tight"
                      title={validationError.message}
                    >
                      Max: {Math.max(0, (row.previous || 0) + (row.received || 0) + (row.transfer_in || 0) - (row.transfer_out || 0))}
                    </span>
                  )}
                </td>

                {/* PRESENT (Read-only calculated) */}
                <td
                  className={`py-0.5 px-0.5 text-center font-extrabold border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[10.5px] sm:text-xs ${
                    isNegative && !coverageIncomplete && row.is_stock_known !== false
                      ? 'text-danger bg-rose-50 dark:bg-rose-950/40'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <span>{coverageIncomplete || row.is_stock_known === false ? '—' : row.present}</span>
                  {row.transfer_out > 0 && (
                    <span className="block text-[6.5px] sm:text-[7.5px] font-sans text-purple-600 dark:text-purple-400 font-bold truncate leading-none">
                      -T:{row.transfer_out}
                    </span>
                  )}
                  {row.transfer_in > 0 && (
                    <span className="block text-[6.5px] sm:text-[7.5px] font-sans text-purple-600 dark:text-purple-400 font-bold truncate leading-none">
                      +T:{row.transfer_in}
                    </span>
                  )}
                </td>

                {/* BNR (Editable Broken Needle Record) */}
                <td className="py-0.5 px-0.5 text-center border-r border-slate-200 dark:border-slate-800">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    disabled={coverageIncomplete || row.is_stock_known === false}
                    data-field="bnr"
                    data-row-index={idx}
                    value={bnrDisplay}
                    onChange={(e) =>
                      handleInputChange(row.needle_item_id, 'bnr', e.target.value)
                    }
                    onBlur={() => handleBlur(row.needle_item_id, 'bnr', row.bnr)}
                    onKeyDown={(e) => handleKeyDown(e, idx, 'bnr')}
                    className="w-full h-6 py-0 px-0.5 text-center rounded border border-purple-300 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/20 text-purple-950 dark:text-purple-200 font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 text-[11px] sm:text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </td>

                {/* TRF ACTION BUTTON - icon only, no "Trf" word */}
                <td className="py-0.5 px-0.5 text-center">
                  <button
                    type="button"
                    onClick={() => onOpenTransfer(row)}
                    disabled={coverageIncomplete || row.is_stock_known === false}
                    title={coverageIncomplete ? 'Connect to network to load stock data for this date.' : 'Floor Transfer'}
                    className="w-full h-6 py-0 px-0.5 bg-[#f59e0b] hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded shadow-xs transition-transform active:scale-95 flex items-center justify-center"
                  >
                    <ArrowRightLeft className="w-3 h-3 shrink-0" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>

        {/* TOTALS FOOTER */}
        <tfoot className="bg-[#1e293b] text-white">
          <tr className="bg-[#1e293b] text-white font-mono font-bold text-xs border-t-2 border-slate-700">
            <td
              colSpan={4}
              className="py-1 px-1 uppercase text-[8.5px] sm:text-[10px] font-sans border-r border-slate-700 bg-[#1e293b] text-white"
            >
              TOTAL ({rows.length})
            </td>
            <td className="py-1 px-0.5 text-center text-slate-200 border-r border-slate-700 bg-[#1e293b] text-[10px] sm:text-xs">
              {coverageIncomplete ? '—' : totals.prev}
            </td>
            <td className="py-1 px-0.5 text-center text-emerald-300 font-bold border-r border-slate-700 bg-[#1e293b] text-[10px] sm:text-xs">
              {totals.rcvd}
            </td>
            <td className="py-1 px-0.5 text-center text-blue-300 font-bold border-r border-slate-700 bg-[#1e293b] text-[10px] sm:text-xs">
              {totals.dvld}
            </td>
            <td className="py-1 px-0.5 text-center text-amber-300 font-extrabold border-r border-slate-700 bg-[#1e293b] text-[10px] sm:text-xs">
              {coverageIncomplete ? '—' : totals.present}
            </td>
            <td className="py-1 px-0.5 text-center text-purple-300 font-bold border-r border-slate-700 bg-[#1e293b] text-[10px] sm:text-xs">
              {totals.bnr}
            </td>
            <td className="py-1 px-0.5 bg-[#1e293b]" />
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  )
}
