'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Pencil,
  Trash2,
  WifiOff,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type {
  DailyEntryCategory,
  DailyEntryRowItem,
  Floor,
  FloorTransferDetail,
} from '@/types'

type ModalMode = 'list' | 'view' | 'edit' | 'delete_confirm'

interface TransferDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  item: DailyEntryRowItem | null
  floorId: string
  floorName: string
  floors: Floor[]
  date: string
  category: DailyEntryCategory
  transfers: FloorTransferDetail[]
  loadingTransfers: boolean
  loadError: string | null
  isOnline: boolean
  canEditTransfer: boolean
  canDeleteTransfer: boolean
  onEditConfirm: (params: {
    transfer: FloorTransferDetail
    newToFloorId: string
    newQuantity: number
    newReceiverName: string
    newReqNo: string
    operationId: string
  }) => Promise<{ success: boolean; error?: string }>
  onDeleteConfirm: (params: {
    transfer: FloorTransferDetail
    operationId: string
  }) => Promise<{ success: boolean; error?: string }>
  onReloadTransfers?: () => void
}

function createOperationUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function TransferDetailsModal({
  isOpen,
  onClose,
  item,
  floors,
  date,
  category,
  transfers,
  loadingTransfers,
  loadError,
  isOnline,
  canEditTransfer,
  canDeleteTransfer,
  onEditConfirm,
  onDeleteConfirm,
  onReloadTransfers,
}: TransferDetailsModalProps) {
  const [mode, setMode] = useState<ModalMode>('view')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Edit form fields
  const [toFloorId, setToFloorId] = useState('')
  const [quantityStr, setQuantityStr] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [reqNo, setReqNo] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const operationIdRef = useRef<string | null>(null)

  const selectedTransfer =
    transfers.find((t) => t.transferId === selectedId) ||
    (transfers.length === 1 ? transfers[0] : null)

  // Synchronize view mode whenever modal opens or transfer list updates
  useEffect(() => {
    if (!isOpen) {
      setMode('view')
      setSelectedId(null)
      setActionError(null)
      setSubmitting(false)
      operationIdRef.current = null
      return
    }

    setActionError(null)
    if (transfers.length > 1) {
      setMode((prev) => (prev === 'edit' || prev === 'delete_confirm' ? prev : 'list'))
      if (selectedId && !transfers.some((t) => t.transferId === selectedId)) {
        setSelectedId(null)
        setMode('list')
      }
    } else if (transfers.length === 1) {
      setSelectedId(transfers[0].transferId)
      setMode((prev) => (prev === 'edit' || prev === 'delete_confirm' ? prev : 'view'))
    } else {
      setSelectedId(null)
      setMode('view')
    }
  }, [isOpen, transfers, selectedId])

  const resetOperationId = () => {
    operationIdRef.current = null
  }

  const getOrCreateOperationId = (): string => {
    if (!operationIdRef.current) {
      operationIdRef.current = createOperationUUID()
    }
    return operationIdRef.current
  }

  const openEditFor = (transfer: FloorTransferDetail) => {
    setSelectedId(transfer.transferId)
    setToFloorId(transfer.toFloorId)
    setQuantityStr(String(transfer.quantity))
    setReceiverName(transfer.receiverName || '')
    setReqNo(transfer.reqNo || '')
    setActionError(null)
    resetOperationId()
    setMode('edit')
  }

  const openDeleteFor = (transfer: FloorTransferDetail) => {
    setSelectedId(transfer.transferId)
    setActionError(null)
    resetOperationId()
    setMode('delete_confirm')
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTransfer || submitting) return

    if (!isOnline) {
      setActionError('You are currently offline. Reconnect to edit floor transfers.')
      return
    }

    const parsedQty = Number(quantityStr)
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setActionError('Transfer quantity must be greater than zero.')
      return
    }
    if (!toFloorId) {
      setActionError('Please select a destination Floor.')
      return
    }
    if (toFloorId === selectedTransfer.fromFloorId) {
      setActionError('Destination Floor must be different from Source Floor.')
      return
    }
    if (!receiverName.trim()) {
      setActionError('Receiver name is required.')
      return
    }

    setActionError(null)
    setSubmitting(true)
    try {
      const opId = getOrCreateOperationId()
      const res = await onEditConfirm({
        transfer: selectedTransfer,
        newToFloorId: toFloorId,
        newQuantity: parsedQty,
        newReceiverName: receiverName.trim(),
        newReqNo: reqNo.trim(),
        operationId: opId,
      })

      if (!res.success) {
        setActionError(res.error || 'Failed to update transfer.')
        return
      }

      resetOperationId()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!selectedTransfer || submitting) return

    if (!isOnline) {
      setActionError('You are currently offline. Reconnect to delete floor transfers.')
      return
    }

    setActionError(null)
    setSubmitting(true)
    try {
      const opId = getOrCreateOperationId()
      const res = await onDeleteConfirm({
        transfer: selectedTransfer,
        operationId: opId,
      })

      if (!res.success) {
        setActionError(res.error || 'Failed to delete transfer.')
        return
      }

      resetOperationId()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (!item) return null

  const needleLabel = `${item.item_code} — ${item.needle_type} (${item.size_dia})`
  const destinationOptions = selectedTransfer
    ? floors.filter((f) => f.id !== selectedTransfer.fromFloorId)
    : floors

  const modalTitle =
    mode === 'delete_confirm'
      ? 'Delete Floor Transfer?'
      : mode === 'edit'
      ? 'Edit Floor Transfer'
      : transfers.length > 1 && mode === 'list'
      ? `Floor Transfers (${transfers.length})`
      : 'Floor Transfer Details'

  const renderFooter = () => {
    if (loadingTransfers) {
      return (
        <Button variant="secondary" onClick={handleClose} className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]">
          Close
        </Button>
      )
    }

    if (mode === 'edit' && selectedTransfer) {
      return (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={() => {
              setActionError(null)
              resetOperationId()
              setMode('view')
            }}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-floor-transfer-form"
            variant="primary"
            loading={submitting}
            loadingText="Saving..."
            disabled={!isOnline || submitting}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
          >
            Save Changes
          </Button>
        </div>
      )
    }

    if (mode === 'delete_confirm' && selectedTransfer) {
      return (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={() => {
              setActionError(null)
              resetOperationId()
              setMode('view')
            }}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={submitting}
            loadingText="Deleting..."
            disabled={!isOnline || submitting}
            onClick={handleConfirmDelete}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
          >
            Confirm Delete
          </Button>
        </div>
      )
    }

    if (mode === 'view' && selectedTransfer) {
      return (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
          >
            Close
          </Button>
          {(canEditTransfer || canDeleteTransfer) && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {canDeleteTransfer && (
                <Button
                  type="button"
                  variant="danger"
                  disabled={!isOnline || submitting}
                  onClick={() => openDeleteFor(selectedTransfer)}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Transfer
                </Button>
              )}
              {canEditTransfer && (
                <Button
                  type="button"
                  variant="primary"
                  disabled={!isOnline || submitting}
                  onClick={() => openEditFor(selectedTransfer)}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Transfer
                </Button>
              )}
            </div>
          )}
        </div>
      )
    }

    return (
      <Button
        type="button"
        variant="secondary"
        onClick={handleClose}
        className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px]"
      >
        Close
      </Button>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      description={`${needleLabel} • ${date} (${category})`}
      maxWidth="md"
      footer={renderFooter()}
    >
      <div className="space-y-4">
        {!isOnline && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              You are offline. Floor transfer modifications and deletions require an online server connection.
            </span>
          </div>
        )}

        {loadingTransfers && (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-slate-500 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
            <span>Loading transfer records...</span>
          </div>
        )}

        {!loadingTransfers && loadError && (
          <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 space-y-2">
            <p className="font-semibold">{loadError}</p>
            {onReloadTransfers && (
              <Button type="button" size="sm" variant="outline" onClick={onReloadTransfers}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            )}
          </div>
        )}

        {!loadingTransfers && !loadError && transfers.length === 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 text-center text-sm text-slate-600 dark:text-slate-400">
            No active floor transfer records were found for this needle on {date}.
          </div>
        )}

        {/* Multiple Transfer Selector List */}
        {!loadingTransfers && !loadError && mode === 'list' && transfers.length > 1 && (
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Multiple transfers recorded for this needle on {date}. Select a transfer record to inspect, edit, or delete:
            </p>
            <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-0.5">
              {transfers.map((tr) => {
                const isOut = tr.direction === 'OUT'
                return (
                  <button
                    key={tr.transferId}
                    type="button"
                    onClick={() => {
                      setSelectedId(tr.transferId)
                      setActionError(null)
                      setMode('view')
                    }}
                    className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-400 dark:hover:border-purple-600 hover:bg-purple-50/40 dark:hover:bg-purple-950/20 p-3 transition-colors min-h-[48px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                          isOut
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                            : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        {isOut ? `-T:${tr.quantity}` : `+T:${tr.quantity}`}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {tr.reqNo ? `Req: ${tr.reqNo}` : 'No Req No.'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>{tr.fromFloorName}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                      <span>{tr.toFloorName}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Receiver: {tr.receiverName || 'N/A'}</span>
                      <span className="font-mono text-[10px] opacity-75">ID: {tr.transferId.slice(0, 8)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Single Transfer Detail View */}
        {!loadingTransfers && !loadError && mode === 'view' && selectedTransfer && (
          <div className="space-y-3">
            {transfers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                  setMode('list')
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline min-h-[36px]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to transfers ({transfers.length})
              </button>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Needle</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{needleLabel}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Date</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{selectedTransfer.transactionDate}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">From Floor</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{selectedTransfer.fromFloorName}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">To Floor</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{selectedTransfer.toFloorName}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Transfer Quantity</p>
                <p className="font-extrabold text-purple-600 dark:text-purple-400 mt-0.5 text-base">
                  {selectedTransfer.direction === 'OUT'
                    ? `-T:${selectedTransfer.quantity}`
                    : `+T:${selectedTransfer.quantity}`}{' '}
                  <span className="text-xs font-semibold text-slate-500">({selectedTransfer.quantity} pcs)</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Receiver Name</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedTransfer.receiverName || 'N/A'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Requisition No.</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedTransfer.reqNo || '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Edit Form Mode */}
        {!loadingTransfers && !loadError && mode === 'edit' && selectedTransfer && (
          <form id="edit-floor-transfer-form" onSubmit={handleSaveEdit} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-2.5 text-xs">
              <div>
                <span className="text-slate-500 block">Source Floor</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTransfer.fromFloorName}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Date</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTransfer.transactionDate}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Needle</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{item.item_code}</span>
              </div>
            </div>

            <div>
              <label htmlFor="edit-to-floor" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Destination Floor <span className="text-rose-500">*</span>
              </label>
              <select
                id="edit-to-floor"
                value={toFloorId}
                onChange={(e) => {
                  setToFloorId(e.target.value)
                  resetOperationId()
                }}
                disabled={submitting}
                className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select destination floor...</option>
                {destinationOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-quantity" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Transfer Quantity <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantityStr}
                onChange={(e) => {
                  setQuantityStr(e.target.value)
                  resetOperationId()
                }}
                disabled={submitting}
                className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label htmlFor="edit-receiver" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Receiver Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-receiver"
                type="text"
                value={receiverName}
                onChange={(e) => {
                  setReceiverName(e.target.value)
                  resetOperationId()
                }}
                disabled={submitting}
                placeholder="Receiver full name"
                className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label htmlFor="edit-req-no" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Requisition No.
              </label>
              <input
                id="edit-req-no"
                type="text"
                value={reqNo}
                onChange={(e) => {
                  setReqNo(e.target.value)
                  resetOperationId()
                }}
                disabled={submitting}
                placeholder="REQ-..."
                className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </form>
        )}

        {/* Delete Confirmation Mode */}
        {!loadingTransfers && !loadError && mode === 'delete_confirm' && selectedTransfer && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3.5 text-rose-900 dark:text-rose-200">
              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs sm:text-sm">
                <p className="font-bold">Deleting this transfer will reverse its effect on both Floors.</p>
                <p className="opacity-90">
                  {selectedTransfer.fromFloorName} will regain {selectedTransfer.quantity} pcs, and{' '}
                  {selectedTransfer.toFloorName} will have {selectedTransfer.quantity} pcs removed from{' '}
                  {selectedTransfer.transactionDate} onwards.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3 text-xs space-y-1 text-slate-700 dark:text-slate-300">
              <div>
                <span className="font-semibold">Route:</span> {selectedTransfer.fromFloorName} → {selectedTransfer.toFloorName}
              </div>
              <div>
                <span className="font-semibold">Quantity:</span> {selectedTransfer.quantity} pcs
              </div>
              <div>
                <span className="font-semibold">Receiver:</span> {selectedTransfer.receiverName || 'N/A'}
              </div>
              <div>
                <span className="font-semibold">Requisition No.:</span> {selectedTransfer.reqNo || '—'}
              </div>
            </div>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
          >
            {actionError}
          </div>
        )}
      </div>
    </Modal>
  )
}
