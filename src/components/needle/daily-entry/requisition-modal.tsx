'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/modal'
import { AlertCircle, Check } from 'lucide-react'
import type { DailyEntryRowItem } from '@/types'

interface RequisitionModalProps {
  isOpen: boolean
  onClose: () => void
  item: DailyEntryRowItem | null
  receivedQty: number
  initialReqNo?: string | null
  defaultApplyToAll?: boolean
  onConfirm: (reqNo: string, applyToAll: boolean) => void
}

export function RequisitionModal({
  isOpen,
  onClose,
  item,
  receivedQty,
  initialReqNo = '',
  defaultApplyToAll = true,
  onConfirm,
}: RequisitionModalProps) {
  const [reqNo, setReqNo] = React.useState(initialReqNo || '')
  const [applyToAll, setApplyToAll] = React.useState(defaultApplyToAll)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isOpen) {
      setReqNo(initialReqNo || '')
      setApplyToAll(defaultApplyToAll)
      setError(null)
      // Focus input when modal opens
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [isOpen, initialReqNo, defaultApplyToAll])

  const handleConfirm = () => {
    const trimmed = reqNo.trim()
    if (!trimmed) {
      setError('Requisition No. প্রদান করা বাধ্যতামূলক।')
      inputRef.current?.focus()
      return
    }
    setError(null)
    onConfirm(trimmed, applyToAll)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
          <span className="text-xl">📋</span>
          <span>Requisition Number</span>
        </div>
      }
      maxWidth="md"
    >
      <div className="space-y-4 pt-1">
        {/* Item Summary Card (matches Image 1) */}
        {item && (
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-lg p-3 space-y-2">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-1.5 font-mono">
              <span className="text-brand dark:text-blue-400">{item.item_code}</span>
              <span className="text-slate-400">|</span>
              <span className="font-sans">{item.needle_type}</span>
              <span className="text-slate-400">|</span>
              <span className="font-sans">Size: {item.size_dia || '-'}</span>
              <span className="text-slate-400">|</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-sans">
                Rcvd Qty: {receivedQty}
              </span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 cursor-pointer"
              />
              <span>এই নম্বর এই floor এর বাকি সব row-এও apply হবে</span>
            </label>
          </div>
        )}

        {/* Input Form */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            Requisition No. <span className="text-red-500 font-bold">(বাধ্যতামূলক):</span>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={reqNo}
            onChange={(e) => {
              setReqNo(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={handleKeyDown}
            placeholder="যেমন: REQ-2026-0456"
            className={`w-full h-10 px-3 text-sm rounded-md border font-mono ${
              error
                ? 'border-red-500 bg-red-50/20 focus:ring-red-500'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-blue-500'
            } text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2`}
          />
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
        </div>

        {/* Confirm Button */}
        <div>
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-lg text-sm shadow-md transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Confirm করুন</span>
          </button>
        </div>

        {/* Warning / Notice text at bottom */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 text-center font-medium pt-1">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>
            {applyToAll
              ? 'এই নম্বর এই floor এর সব row-এ apply হবে'
              : 'এই নম্বর শুধুমাত্র এই নির্দিষ্ট row-এ apply হবে'}
          </span>
        </div>
      </div>
    </Modal>
  )
}
