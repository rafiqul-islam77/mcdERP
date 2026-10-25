'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ArrowRightLeft, AlertTriangle } from 'lucide-react'
import type { DailyEntryRowItem, Floor } from '@/types'

interface TransferModalProps {
  isOpen: boolean
  onClose: () => void
  item: DailyEntryRowItem | null
  currentFloor: Floor | null
  activeFloors: Floor[]
  onConfirm: (data: {
    toFloorId: string
    quantity: number
    receiverName: string
    reqNo?: string
  }) => Promise<{ success: boolean; error?: string }>
}

export function TransferModal({
  isOpen,
  onClose,
  item,
  currentFloor,
  activeFloors,
  onConfirm,
}: TransferModalProps) {
  const [toFloorId, setToFloorId] = React.useState('')
  const [quantity, setQuantity] = React.useState('')
  const [receiverName, setReceiverName] = React.useState('')
  const [reqNo, setReqNo] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset state when opened with a new item
  React.useEffect(() => {
    if (isOpen) {
      setToFloorId('')
      setQuantity('')
      setReceiverName('')
      setReqNo('')
      setError(null)
    }
  }, [isOpen, item])

  if (!item || !currentFloor) return null

  const presentStock = item.present
  const availableFloors = activeFloors.filter((f) => f.id !== currentFloor.id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!toFloorId) {
      setError('Please select a destination floor.')
      return
    }

    const qtyNum = Number(quantity)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }

    if (qtyNum > presentStock) {
      setError(`Cannot transfer ${qtyNum}. Only ${presentStock} present in stock.`)
      return
    }

    if (!receiverName.trim()) {
      setError('Receiver name is required.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await onConfirm({
        toFloorId,
        quantity: qtyNum,
        receiverName: receiverName.trim(),
        reqNo: reqNo.trim() || undefined,
      })

      if (res.success) {
        onClose()
      } else {
        setError(res.error || 'Transfer failed.')
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Floor Transfer" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Needle Item Summary Card */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-erp space-y-1 text-xs">
          <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
            <span className="font-mono text-sm text-brand dark:text-blue-400">{item.item_code}</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {item.brand}
            </span>
          </div>
          <div className="text-slate-600 dark:text-slate-400 flex items-center gap-3">
            <span>Type: <b>{item.needle_type}</b></span>
            <span>Size: <b>{item.size_dia || 'N/A'}</b></span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-slate-500">From Floor: <b>{currentFloor.name}</b></span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="text-slate-600 dark:text-slate-400">Available:</span>
              <span className={presentStock <= 0 ? 'text-danger font-mono' : 'text-emerald-600 font-mono text-sm'}>
                {presentStock}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-erp text-xs text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          {/* Destination Floor */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              To Floor <span className="text-danger">*</span>
            </label>
            <Select
              value={toFloorId}
              onChange={(e) => setToFloorId(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-xs"
            >
              <option value="">-- Select Destination Floor --</option>
              {availableFloors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Transfer Quantity */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Quantity to Transfer <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              min="1"
              max={Math.max(1, presentStock)}
              step="1"
              inputMode="numeric"
              placeholder="e.g. 20"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-xs"
            />
          </div>

          {/* Receiver Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Receiver Name <span className="text-danger">*</span>
            </label>
            <Input
              type="text"
              placeholder="Operator / Receiver name"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-xs"
            />
          </div>

          {/* Requisition Number / Reference */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Requisition No. / Reference <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <Input
              type="text"
              placeholder="Auto-generated if left empty"
              value={reqNo}
              onChange={(e) => setReqNo(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-xs"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSubmitting || presentStock <= 0}
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Transferring...' : 'Confirm Transfer'}</span>
          </Button>
        </div>
      </form>
    </Modal>
  )
}
