'use client'

import React from 'react'
import {
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Minus,
  Maximize2,
  Download,
  RefreshCw,
  Calendar,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface FloorProgressItem {
  id: string
  floorName: string
  category?: string
  date: string
  itemsCount: number
  presentStock: number
  source: 'actual' | 'carry' | 'opening'
}

export interface ExportProgressState {
  isOpen: boolean
  exportType: 'stock_excel' | 'present_excel' | 'pdf'
  exportName: string // e.g. "Closing Stock", "Daily Stock", "Daily Stock PDF"
  date: string
  floorLabel: string
  category?: string
  isAllFloors: boolean
  status: 'idle' | 'running' | 'completed' | 'failed'
  statusMessage: string
  currentStep: number // 1 to totalSteps
  totalSteps: number
  progressPercent: number // 0 to 100
  itemsLabel?: string // e.g. "3 / 14 Floors" or "41 / 41 rows"
  floorItems: FloorProgressItem[]
  downloadUrl?: string
  downloadFilename?: string
  errorMessage?: string
}

interface ExportProgressModalProps {
  state: ExportProgressState
  onClose: () => void
  onRetry?: () => void
  onDownloadAgain?: () => void
}

export function ExportProgressModal({
  state,
  onClose,
  onRetry,
  onDownloadAgain,
}: ExportProgressModalProps) {
  const [isMinimized, setIsMinimized] = React.useState(false)

  // Reset minimized state when modal is reopened
  React.useEffect(() => {
    if (state.isOpen) {
      setIsMinimized(false)
    }
  }, [state.isOpen])

  if (!state.isOpen) return null

  const isExcel = state.exportType === 'stock_excel' || state.exportType === 'present_excel'
  const isRunning = state.status === 'running'
  const isCompleted = state.status === 'completed'
  const isFailed = state.status === 'failed'

  // Minimized floating badge in bottom right (allows full uninterrupted page usage)
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
        <div className="flex items-center gap-3 bg-surface border-2 border-brand/40 shadow-xl rounded-erp p-3 text-ink text-xs min-w-[280px]">
          {isExcel ? (
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{state.exportName}</div>
            <div className="text-[11px] text-ink-muted flex items-center gap-1.5 truncate">
              {isRunning && <Loader2 className="w-3 h-3 animate-spin text-amber-500 shrink-0" />}
              {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
              {isFailed && <AlertCircle className="w-3 h-3 text-danger shrink-0" />}
              <span>{state.statusMessage}</span>
            </div>
            {/* Tiny progress bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isCompleted
                    ? 'bg-emerald-500'
                    : isFailed
                    ? 'bg-danger'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, state.progressPercent))}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-ink-muted hover:text-ink transition-colors"
              title="Expand progress window"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            {!isRunning && (
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-ink-muted hover:text-ink transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Full Non-Blocking Progress Modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Semi-transparent backdrop with click-outside support when not running */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 transition-opacity"
        onClick={() => {
          if (!isRunning) onClose()
        }}
      />

      {/* Modal Dialog Card */}
      <div
        className="relative z-10 w-full max-w-lg bg-surface border border-surface-border rounded-erp shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-progress-title"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            {isExcel ? (
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />
            )}
            <h3 id="export-progress-title" className="text-sm font-bold text-ink">
              📥 {state.exportName} Download
            </h3>
          </div>

          <div className="flex items-center gap-1">
            {/* Minimize button to allow continuing work on page */}
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-ink-muted hover:text-ink transition-colors"
              title="Minimize to corner"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Close button (disabled during active generation to prevent aborted streams) */}
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-ink-muted hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={isRunning ? 'Please wait until export completes' : 'Close'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3.5">
          {/* Date & Target Info */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date:</span>
              <span className="font-mono font-bold text-ink">{state.date}</span>
            </div>
          </div>

          {/* Scope Card (matching reference design) */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-surface-border rounded-erp p-3 text-xs text-ink space-y-1">
            {state.isAllFloors ? (
              <>
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>All authorized Floors exported into a single workbook</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Layers className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                  <span>Each floor maintained on an independent sheet</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>Comprehensive <b>SUMMARY</b> sheet with grand totals</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Floor: <b>{state.floorLabel}</b></span>
                </div>
                {state.category && (
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <Layers className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                    <span>Category: <b>{state.category}</b> Needle</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>Authoritative present balance and stock calculation</span>
                </div>
              </>
            )}
          </div>

          {/* Progress Status Header */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-ink">
                {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />}
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                {isFailed && <AlertCircle className="w-3.5 h-3.5 text-danger" />}
                <span>{state.statusMessage}</span>
              </span>
              {state.itemsLabel && (
                <span className="font-mono text-[11px] text-ink-muted">
                  {state.itemsLabel}
                </span>
              )}
            </div>

            {/* Horizontal Progress Bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isCompleted
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                    : isFailed
                    ? 'bg-danger'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600'
                }`}
                style={{ width: `${Math.min(100, Math.max(3, state.progressPercent))}%` }}
              />
            </div>
          </div>

          {/* Floor Items List (Scrollable for All Floors) */}
          {state.isAllFloors && state.floorItems.length > 0 && (
            <div className="border border-surface-border rounded-erp bg-slate-50/80 dark:bg-slate-900/60 p-2 max-h-40 overflow-y-auto space-y-1 font-mono text-[11px]">
              {state.floorItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-0.5 border-b border-surface-border/50 last:border-b-0 text-ink"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-emerald-600 dark:text-emerald-400">✅</span>
                    <span className="font-bold truncate">
                      {idx + 1}. {item.floorName}
                    </span>
                    {item.category && (
                      <span className="text-[10px] text-ink-muted">({item.category})</span>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-ink-muted">
                    <span>Items: <b>{item.itemsCount}</b></span>
                    <span className="mx-1">•</span>
                    <span>Present: <b>{item.presentStock.toLocaleString()}</b></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error Banner on Failure */}
          {isFailed && (
            <div className="p-3 rounded-erp bg-danger/10 border border-danger/30 text-danger text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold">Export Failed</div>
                <div>{state.errorMessage || 'An unexpected error occurred during generation.'}</div>
              </div>
            </div>
          )}

          {/* Completion Banner */}
          {isCompleted && (
            <div className="p-2.5 rounded-erp bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Generation Complete ✓</span>
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">File Ready</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-surface-border bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-3">
          <div className="text-[11px] text-ink-muted">
            {isRunning && 'Please do not close this window while generating.'}
            {isCompleted && 'Your file download has started.'}
            {isFailed && 'Click Retry to try generating the report again.'}
          </div>

          <div className="flex items-center gap-2">
            {/* If Failed, show Retry and Close */}
            {isFailed && (
              <>
                <Button size="sm" variant="outline" onClick={onClose} className="text-xs">
                  Close
                </Button>
                {onRetry && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onRetry}
                    className="text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </Button>
                )}
              </>
            )}

            {/* If Running, show disabled Loading state */}
            {isRunning && (
              <Button
                size="sm"
                disabled
                className="text-xs bg-amber-500 text-black font-bold opacity-80 cursor-not-allowed gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating...</span>
              </Button>
            )}

            {/* If Completed, show Download button */}
            {isCompleted && (
              <>
                <Button size="sm" variant="outline" onClick={onClose} className="text-xs">
                  Close
                </Button>
                {onDownloadAgain && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onDownloadAgain}
                    className="text-xs bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Again</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
