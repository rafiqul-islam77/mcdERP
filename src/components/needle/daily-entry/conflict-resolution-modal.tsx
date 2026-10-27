'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/modal'
import { AlertTriangle, Check, Trash2, RefreshCw } from 'lucide-react'
import type { PendingSyncOperation, Floor, DailyEntryRowItem } from '@/types'

interface ConflictResolutionModalProps {
  isOpen: boolean
  onClose: () => void
  conflicts: PendingSyncOperation[]
  onResolveEdit: (operationId: string, newDvld: number) => Promise<void>
  onDiscard: (operationId: string) => Promise<void>
  authorizedFloors: Floor[]
  rows?: DailyEntryRowItem[]
}

export function ConflictResolutionModal({
  isOpen,
  onClose,
  conflicts,
  onResolveEdit,
  onDiscard,
  authorizedFloors,
  rows = [],
}: ConflictResolutionModalProps) {
  const [editValues, setEditValues] = React.useState<Record<string, string>>({})
  const [busyOps, setBusyOps] = React.useState<Set<string>>(new Set())
  const [errorMap, setErrorMap] = React.useState<Record<string, string>>({})

  // Initialize input values when modal opens or conflicts change
  React.useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {}
      conflicts.forEach((c) => {
        // Derive available stock
        const avail = getAvailableStock(c)
        // Suggest available stock or empty
        initial[c.id] = initial[c.id] ?? String(avail)
      })
      setEditValues((prev) => ({ ...initial, ...prev }))
    }
  }, [isOpen, conflicts])

  const getAvailableStock = (op: PendingSyncOperation): number => {
    if (op.server_available_stock !== undefined && op.server_available_stock !== null) {
      return op.server_available_stock
    }
    const match = op.error?.match(/available stock[^\d]*(\d+)/i)
    if (match && match[1]) {
      return parseInt(match[1], 10)
    }
    return 0
  }

  const handleValueChange = (opId: string, val: string) => {
    setEditValues((prev) => ({ ...prev, [opId]: val }))
    if (errorMap[opId]) {
      setErrorMap((prev) => {
        const next = { ...prev }
        delete next[opId]
        return next
      })
    }
  }

  const handleResolve = async (opId: string, valueToApply: number, availableStock: number) => {
    if (isNaN(valueToApply) || valueToApply < 0) {
      setErrorMap((prev) => ({ ...prev, [opId]: 'Quantity must be 0 or greater.' }))
      return
    }
    if (valueToApply > availableStock) {
      setErrorMap((prev) => ({
        ...prev,
        [opId]: `Cannot exceed available stock (${availableStock}).`,
      }))
      return
    }

    setBusyOps((prev) => new Set(prev).add(opId))
    try {
      await onResolveEdit(opId, valueToApply)
      // Clear error on success
      setErrorMap((prev) => {
        const next = { ...prev }
        delete next[opId]
        return next
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMap((prev) => ({ ...prev, [opId]: err.message }))
      }
    } finally {
      setBusyOps((prev) => {
        const next = new Set(prev)
        next.delete(opId)
        return next
      })
    }
  }

  const handleDiscard = async (opId: string) => {
    setBusyOps((prev) => new Set(prev).add(opId))
    try {
      await onDiscard(opId)
      setErrorMap((prev) => {
        const next = { ...prev }
        delete next[opId]
        return next
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMap((prev) => ({ ...prev, [opId]: err.message }))
      }
    } finally {
      setBusyOps((prev) => {
        const next = new Set(prev)
        next.delete(opId)
        return next
      })
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-base font-bold text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Sync Stock Conflicts ({conflicts.length})</span>
        </div>
      }
      description="The server rejected the following delivery quantities because they exceeded available stock. Please correct or discard each item."
      maxWidth="xl"
    >
      <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">
        {conflicts.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              All conflicts resolved!
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All delivery entries are now consistent with available server stock.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          conflicts.map((op) => {
            const avail = getAvailableStock(op)
            const row = rows.find((r) => r.needle_item_id === op.needle_item_id)
            const floor = authorizedFloors.find((f) => f.id === op.floor_id)
            const floorName = floor ? floor.name : op.floor_id
            const itemCode = row?.item_code || op.needle_item_id
            const needleType = row?.needle_type || ''
            const brand = row?.brand || ''
            const size = row?.size_dia || ''
            const isBusy = busyOps.has(op.id)
            const currentValStr = editValues[op.id] ?? String(avail)
            const currentValNum = parseInt(currentValStr, 10)
            const isValValid =
              !isNaN(currentValNum) && currentValNum >= 0 && currentValNum <= avail
            const opError = errorMap[op.id]

            return (
              <div
                key={op.id}
                className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-lg p-3.5 shadow-xs space-y-3"
              >
                {/* Header Information: Needle Code, Floor, Category, Date */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {itemCode}
                    </span>
                    {(needleType || brand) && (
                      <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                        {needleType} {brand ? `• ${brand}` : ''} {size ? `(${size})` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {floorName}
                    </span>
                    <span className="bg-brand/10 text-brand dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                      {op.category}
                    </span>
                    <span className="text-slate-400">|</span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {op.entry_date}
                    </span>
                  </div>
                </div>

                {/* Stock Discrepancy Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 rounded p-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Delivery entered (Invalid):</span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm line-through">
                        {op.value}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                      <span className="font-medium">Current available stock:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        {avail}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center text-[11px] text-amber-800 dark:text-amber-300 font-medium sm:border-l sm:border-amber-200/60 dark:sm:border-amber-900/40 sm:pl-3">
                    <span>
                      {op.error || 'Delivery exceeds maximum available stock before issue.'}
                    </span>
                  </div>
                </div>

                {opError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {opError}
                  </p>
                )}

                {/* Resolution Actions: Edit Input, Use Available, Save, Discard */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  {/* Left: Input for corrected DVLD */}
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      New Delivery:
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={avail}
                      value={currentValStr}
                      onChange={(e) => handleValueChange(op.id, e.target.value)}
                      disabled={isBusy}
                      className="w-24 h-8 px-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolve(op.id, currentValNum, avail)}
                      disabled={!isValValid || isBusy}
                      title="Apply new delivery quantity and resync"
                      className="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors shadow-xs"
                    >
                      {isBusy ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      )}
                      <span>Save & Resync</span>
                    </button>
                  </div>

                  {/* Right: Quick Convenience Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleValueChange(op.id, String(avail))
                        handleResolve(op.id, avail, avail)
                      }}
                      disabled={isBusy}
                      title={`Quickly set delivery to maximum available stock (${avail})`}
                      className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-semibold rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-50 transition-colors"
                    >
                      <span>Use Available ({avail})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDiscard(op.id)}
                      disabled={isBusy}
                      title="Discard local change and restore authoritative server stock"
                      className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-semibold rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                      <span>Discard</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
