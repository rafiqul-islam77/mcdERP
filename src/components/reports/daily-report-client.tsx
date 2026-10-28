'use client'

import React from 'react'
import {
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  Calendar,
  Layers,
  MapPin,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PresentBalanceTable } from '@/components/reports/present-balance-table'
import { ReportSkeleton } from '@/components/reports/report-skeleton'
import { getDailyReportAction, getDailyStockReportDataAction } from '@/app/actions/reports'
import { generatePresentBalancePDF } from '@/lib/reports/pdf-generator'
import { formatFloorDisplayName } from '@/lib/reports/report-utils'
import {
  ExportProgressModal,
  type ExportProgressState,
  type FloorProgressItem,
} from '@/components/reports/export-progress-modal'
import type { DailyEntryCategory, DailyReportData, Floor } from '@/types'

interface DailyReportClientProps {
  defaultCategory: DailyEntryCategory
  initialFloors: Floor[]
  allowedCategories: DailyEntryCategory[]
  userPermissions: string[]
  isSiteAdmin: boolean
}

export function DailyReportClient({
  defaultCategory,
  initialFloors,
  allowedCategories,
  userPermissions,
  isSiteAdmin,
}: DailyReportClientProps) {
  // 1. Initial State
  const [date, setDate] = React.useState<string>(() => {
    return new Date().toISOString().slice(0, 10)
  })

  const [selectedFloorId, setSelectedFloorId] = React.useState<string>(() => {
    return initialFloors[0]?.id || ''
  })

  const [selectedCategory, setSelectedCategory] = React.useState<DailyEntryCategory>(defaultCategory)
  const [searchQuery, setSearchQuery] = React.useState<string>('')
  const [reportData, setReportData] = React.useState<DailyReportData | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  // Export action progress states
  const [exportingStock, setExportingStock] = React.useState<boolean>(false)
  const [exportingPresent, setExportingPresent] = React.useState<boolean>(false)
  const [exportingPdf, setExportingPdf] = React.useState<boolean>(false)

  // Progress modal state for active export
  const [progressModalState, setProgressModalState] = React.useState<ExportProgressState>({
    isOpen: false,
    exportType: 'stock_excel',
    exportName: 'Closing Stock',
    date,
    floorLabel: 'All Floors',
    isAllFloors: false,
    status: 'idle',
    statusMessage: '',
    currentStep: 0,
    totalSteps: 4,
    progressPercent: 0,
    floorItems: [],
  })

  // Ref to hold the most recently generated export for "Download Again"
  const lastExportRef = React.useRef<{ blob?: Blob; pdf?: any; filename: string } | null>(null)

  // Any ongoing export prevents double-clicks
  const isAnyExporting = exportingStock || exportingPresent || exportingPdf

  // 2. Permission checks
  const canExportStock =
    isSiteAdmin ||
    userPermissions.includes('daily_report.export_stock_excel') ||
    userPermissions.includes('needle.daily_report.export_stock_excel') ||
    userPermissions.includes('broken.daily_report.export_stock_excel') ||
    userPermissions.includes('idle.daily_report.export_stock_excel') ||
    userPermissions.includes('needle.daily_report.export')

  const canExportPresent =
    isSiteAdmin ||
    userPermissions.includes('daily_report.export_present_excel') ||
    userPermissions.includes('needle.daily_report.export_present_excel') ||
    userPermissions.includes('broken.daily_report.export_present_excel') ||
    userPermissions.includes('idle.daily_report.export_present_excel') ||
    userPermissions.includes('needle.daily_report.export')

  const canExportPdf =
    isSiteAdmin ||
    userPermissions.includes('daily_report.export_pdf') ||
    userPermissions.includes('needle.daily_report.export_pdf') ||
    userPermissions.includes('broken.daily_report.export_pdf') ||
    userPermissions.includes('idle.daily_report.export_pdf') ||
    userPermissions.includes('needle.daily_report.export')

  const canPrint =
    isSiteAdmin ||
    userPermissions.includes('daily_report.print') ||
    userPermissions.includes('needle.daily_report.print') ||
    userPermissions.includes('broken.daily_report.print') ||
    userPermissions.includes('idle.daily_report.print')

  // 3. Fetch authoritative report data
  const loadReport = React.useCallback(async () => {
    if (!selectedFloorId) return
    setLoading(true)
    setError(null)

    try {
      const res = await getDailyReportAction({
        date,
        floorId: selectedFloorId,
        category: selectedCategory,
      })

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load report data.')
        setReportData(null)
      } else {
        setReportData(res.data)
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while loading report.')
      setReportData(null)
    } finally {
      setLoading(false)
    }
  }, [date, selectedFloorId, selectedCategory])

  React.useEffect(() => {
    loadReport()
  }, [loadReport])

  // Helper to trigger safe asynchronous browser download without prematurely revoking blob URL
  const downloadBlobSafely = (blob: Blob, filename: string) => {
    const downloadUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Defer revocation to prevent Windows/Excel corrupted 0-byte downloads caused by premature URL cleanup
    setTimeout(() => {
      window.URL.revokeObjectURL(downloadUrl)
    }, 60000)
  }

  // 4. Export handlers with progress states and duplicate-click prevention
  const handleExportStockExcel = async () => {
    if (isAnyExporting) return
    const isAll = selectedFloorId === 'all'
    let floorLabel = 'All Floors'
    if (!isAll) {
      const curFloor = initialFloors.find((f) => f.id === selectedFloorId)
      floorLabel = curFloor ? (curFloor.code || curFloor.name) : (reportData?.floorCode || reportData?.floorName || 'Floor')
    }
    const safeFloor = floorLabel.replace(/[/\\?*:[\]<>|"]/g, '-').trim()
    const filename = `Closing Stock - ${safeFloor} - ${date}.xlsx`

    setExportingStock(true)
    setError(null)
    setProgressModalState({
      isOpen: true,
      exportType: 'stock_excel',
      exportName: 'Closing Stock',
      date,
      floorLabel,
      isAllFloors: isAll,
      status: 'running',
      statusMessage: 'Preparing report...',
      currentStep: 1,
      totalSteps: isAll ? initialFloors.length + 2 : 4,
      progressPercent: 5,
      itemsLabel: isAll ? `0 / ${initialFloors.length} Floors` : undefined,
      floorItems: [],
      downloadFilename: filename,
    })

    try {
      const floorItems: FloorProgressItem[] = []

      if (isAll && initialFloors.length > 0) {
        for (let i = 0; i < initialFloors.length; i++) {
          const floor = initialFloors[i]
          const pct = Math.round(5 + ((i + 1) / initialFloors.length) * 65)
          setProgressModalState((prev) => ({
            ...prev,
            statusMessage: `Processing ${i + 1} / ${initialFloors.length} Floors (${floor.name})...`,
            progressPercent: pct,
            itemsLabel: `${i + 1} / ${initialFloors.length} Floors`,
          }))

          const repRes = await getDailyStockReportDataAction({ date, floorId: floor.id })
          let itemsCount = 0
          let presentTotal = 0
          if (repRes.success && repRes.data) {
            const allReps = [
              ...(repRes.data.runningReports || []),
              ...(repRes.data.newReports || []),
              ...(repRes.data.idleReports || []),
            ]
            for (const r of allReps) {
              itemsCount += r.rows.length
              presentTotal += r.summary.totalPresent
            }
          }

          const newItem: FloorProgressItem = {
            id: floor.id,
            floorName: floor.name,
            date,
            itemsCount,
            presentStock: presentTotal,
            source: 'actual',
          }
          floorItems.push(newItem)

          setProgressModalState((prev) => ({
            ...prev,
            floorItems: [...floorItems],
          }))
        }
      } else {
        await new Promise((r) => setTimeout(r, 120))
        setProgressModalState((prev) => ({
          ...prev,
          statusMessage: `Fetching report data for ${floorLabel}...`,
          progressPercent: 35,
          currentStep: 2,
        }))
      }

      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Generating Excel workbook...',
        progressPercent: isAll ? 80 : 65,
        currentStep: isAll ? initialFloors.length + 1 : 3,
      }))

      const url = `/api/reports/stock-excel?date=${encodeURIComponent(date)}&floorId=${encodeURIComponent(
        selectedFloorId
      )}`
      const res = await fetch(url)
      if (!res.ok) {
        let errMessage = 'Closing Stock export failed. Try again.'
        try {
          const errJson = await res.json()
          if (errJson.error) errMessage = errJson.error
        } catch {}
        throw new Error(errMessage)
      }

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('spreadsheetml') && !contentType.includes('octet-stream')) {
        throw new Error('Server returned an invalid format instead of an Excel spreadsheet.')
      }

      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Finalizing file...',
        progressPercent: 92,
        currentStep: isAll ? initialFloors.length + 2 : 4,
      }))

      const arrayBuffer = await res.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength < 500) {
        throw new Error('Received an incomplete Excel file. Please try again.')
      }

      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      lastExportRef.current = { blob, filename }

      setProgressModalState((prev) => ({
        ...prev,
        status: 'completed',
        statusMessage: 'Generation Complete ✓',
        progressPercent: 100,
      }))

      downloadBlobSafely(blob, filename)
    } catch (err: any) {
      const errorMsg = err.message || 'Excel generation failed. Try again.'
      setError(errorMsg)
      setProgressModalState((prev) => ({
        ...prev,
        status: 'failed',
        statusMessage: 'Generation Failed',
        errorMessage: errorMsg,
      }))
    } finally {
      setExportingStock(false)
    }
  }

  const handleExportPresentExcel = async () => {
    if (isAnyExporting) return
    const isAll = selectedFloorId === 'all'
    let floorLabel = 'All Floors'
    if (!isAll) {
      const curFloor = initialFloors.find((f) => f.id === selectedFloorId)
      floorLabel = curFloor ? (curFloor.code || curFloor.name) : (reportData?.floorCode || reportData?.floorName || 'Floor')
    }
    const cleanFloor = floorLabel.replace(/[/\\?*:[\]<>|"]/g, '-').trim()
    const filename = isAll
      ? `Daily Stock - All Floors - ${date}.xlsx`
      : `Daily Stock - ${cleanFloor} - ${selectedCategory} - ${date}.xlsx`

    setExportingPresent(true)
    setError(null)
    setProgressModalState({
      isOpen: true,
      exportType: 'present_excel',
      exportName: 'Daily Stock',
      date,
      floorLabel,
      category: selectedCategory,
      isAllFloors: isAll,
      status: 'running',
      statusMessage: 'Preparing report...',
      currentStep: 1,
      totalSteps: isAll ? initialFloors.length + 2 : 4,
      progressPercent: 5,
      itemsLabel: isAll ? `0 / ${initialFloors.length} Floors` : undefined,
      floorItems: [],
      downloadFilename: filename,
    })

    try {
      const floorItems: FloorProgressItem[] = []

      if (isAll && initialFloors.length > 0) {
        for (let i = 0; i < initialFloors.length; i++) {
          const floor = initialFloors[i]
          const pct = Math.round(5 + ((i + 1) / initialFloors.length) * 65)
          setProgressModalState((prev) => ({
            ...prev,
            statusMessage: `Processing ${i + 1} / ${initialFloors.length} Floors (${floor.name})...`,
            progressPercent: pct,
            itemsLabel: `${i + 1} / ${initialFloors.length} Floors`,
          }))

          const repRes = await getDailyReportAction({
            date,
            floorId: floor.id,
            category: selectedCategory,
          })

          let itemsCount = 0
          let presentTotal = 0
          if (repRes.success && repRes.data) {
            itemsCount = repRes.data.rows.length
            presentTotal = repRes.data.summary.totalPresent
          }

          const newItem: FloorProgressItem = {
            id: floor.id,
            floorName: floor.name,
            category: selectedCategory,
            date,
            itemsCount,
            presentStock: presentTotal,
            source: 'actual',
          }
          floorItems.push(newItem)

          setProgressModalState((prev) => ({
            ...prev,
            floorItems: [...floorItems],
          }))
        }
      } else {
        await new Promise((r) => setTimeout(r, 120))
        setProgressModalState((prev) => ({
          ...prev,
          statusMessage: `Fetching report data for ${floorLabel}...`,
          progressPercent: 35,
          currentStep: 2,
        }))
      }

      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Generating Excel workbook...',
        progressPercent: isAll ? 80 : 65,
        currentStep: isAll ? initialFloors.length + 1 : 3,
      }))

      const url = `/api/reports/present-balance-excel?date=${encodeURIComponent(
        date
      )}&floorId=${encodeURIComponent(selectedFloorId)}&category=${encodeURIComponent(selectedCategory)}`
      const res = await fetch(url)
      if (!res.ok) {
        let errMessage = 'Daily Stock export failed. Try again.'
        try {
          const errJson = await res.json()
          if (errJson.error) errMessage = errJson.error
        } catch {}
        throw new Error(errMessage)
      }

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('spreadsheetml') && !contentType.includes('octet-stream')) {
        throw new Error('Server returned an invalid format instead of an Excel spreadsheet.')
      }

      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Finalizing file...',
        progressPercent: 92,
        currentStep: isAll ? initialFloors.length + 2 : 4,
      }))

      const arrayBuffer = await res.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength < 500) {
        throw new Error('Received an incomplete Excel file. Please try again.')
      }

      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      lastExportRef.current = { blob, filename }

      setProgressModalState((prev) => ({
        ...prev,
        status: 'completed',
        statusMessage: 'Generation Complete ✓',
        progressPercent: 100,
      }))

      downloadBlobSafely(blob, filename)
    } catch (err: any) {
      const errorMsg = err.message || 'Excel generation failed. Try again.'
      setError(errorMsg)
      setProgressModalState((prev) => ({
        ...prev,
        status: 'failed',
        statusMessage: 'Generation Failed',
        errorMessage: errorMsg,
      }))
    } finally {
      setExportingPresent(false)
    }
  }

  const handleExportPdf = async () => {
    if (!reportData || isAnyExporting) return
    const cleanFloor = (reportData.floorCode || reportData.floorName).replace(/\s+/g, '-')
    const filename = `GMS-Needle-PresentBalance-${cleanFloor}-${reportData.category}-${reportData.date}.pdf`
    const totalRows = reportData.rows.length

    setExportingPdf(true)
    setError(null)
    setProgressModalState({
      isOpen: true,
      exportType: 'pdf',
      exportName: 'Daily Stock PDF',
      date: reportData.date,
      floorLabel: formatFloorDisplayName(reportData.floorName, reportData.locationName),
      category: reportData.category,
      isAllFloors: false,
      status: 'running',
      statusMessage: 'Preparing PDF document...',
      currentStep: 1,
      totalSteps: 4,
      progressPercent: 10,
      itemsLabel: `0 / ${totalRows} rows processed`,
      floorItems: [],
      downloadFilename: filename,
    })

    try {
      await new Promise((resolve) => setTimeout(resolve, 80))

      // Step 2: Compiling table rows
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: `Processing ${totalRows} / ${totalRows} rows...`,
        progressPercent: 45,
        itemsLabel: `${totalRows} / ${totalRows} rows processed`,
        currentStep: 2,
      }))
      await new Promise((resolve) => setTimeout(resolve, 80))

      // Step 3: Rendering PDF
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Generating PDF vector layouts & signatures...',
        progressPercent: 75,
        currentStep: 3,
      }))
      await new Promise((resolve) => setTimeout(resolve, 80))

      const pdf = generatePresentBalancePDF(reportData)

      // Step 4: Finalizing
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Finalizing file...',
        progressPercent: 95,
        currentStep: 4,
      }))
      await new Promise((resolve) => setTimeout(resolve, 50))

      lastExportRef.current = { pdf, filename }

      setProgressModalState((prev) => ({
        ...prev,
        status: 'completed',
        statusMessage: 'Generation Complete ✓',
        progressPercent: 100,
      }))

      pdf.save(filename)
    } catch (err: any) {
      const errorMsg = err.message || 'PDF generation failed. Try again.'
      setError(errorMsg)
      setProgressModalState((prev) => ({
        ...prev,
        status: 'failed',
        statusMessage: 'Generation Failed',
        errorMessage: errorMsg,
      }))
    } finally {
      setExportingPdf(false)
    }
  }

  const handleCloseModal = () => {
    setProgressModalState((prev) => ({ ...prev, isOpen: false }))
  }

  const handleRetryExport = () => {
    if (progressModalState.exportType === 'stock_excel') {
      handleExportStockExcel()
    } else if (progressModalState.exportType === 'present_excel') {
      handleExportPresentExcel()
    } else if (progressModalState.exportType === 'pdf') {
      handleExportPdf()
    }
  }

  const handleDownloadAgain = () => {
    if (!lastExportRef.current) return
    if (lastExportRef.current.blob && lastExportRef.current.filename) {
      downloadBlobSafely(lastExportRef.current.blob, lastExportRef.current.filename)
    } else if (lastExportRef.current.pdf && lastExportRef.current.filename) {
      lastExportRef.current.pdf.save(lastExportRef.current.filename)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SCREEN UI (Hidden during print) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="print:hidden space-y-4">
        {/* Top Control Header Card */}
        <div className="bg-surface border border-surface-border rounded-erp p-4 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-ink tracking-tight flex items-center gap-2">
                <span>Daily Report</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-brand font-semibold uppercase">
                  {selectedCategory}
                </span>
              </h1>
              <p className="text-xs text-ink-muted">
                Official Present Balance and Stock Summary reporting for verified inventory.
              </p>
            </div>

            {/* Action Export Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {canExportStock && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportStockExcel}
                  disabled={isAnyExporting}
                  loading={exportingStock}
                  loadingText="Generating Excel..."
                  className="text-xs border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{exportingStock ? 'Generating Excel...' : 'Closing Stock'}</span>
                </Button>
              )}

              {canExportPresent && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportPresentExcel}
                  disabled={isAnyExporting || !reportData}
                  loading={exportingPresent}
                  loadingText="Generating Excel..."
                  className="text-xs border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{exportingPresent ? 'Generating Excel...' : 'Daily Stock'}</span>
                </Button>
              )}

              {canExportPdf && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportPdf}
                  disabled={isAnyExporting || !reportData}
                  loading={exportingPdf}
                  loadingText="Generating PDF..."
                  className="text-xs border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-400"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{exportingPdf ? 'Generating PDF...' : 'PDF'}</span>
                </Button>
              )}

              {canPrint && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handlePrint}
                  disabled={!reportData}
                  className="text-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={loadReport}
                disabled={loading}
                title="Refresh Report"
                className="px-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-surface-border/60">
            {/* Date Picker */}
            <div>
              <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Report Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full text-xs font-medium pl-8 pr-3 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            {/* Floor Selection */}
            <div>
              <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Floor
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                <select
                  value={selectedFloorId}
                  onChange={(e) => setSelectedFloorId(e.target.value)}
                  className="w-full text-xs font-medium pl-8 pr-3 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {initialFloors.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.name} {floor.code ? `(${floor.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Category
              </label>
              <div className="relative">
                <Layers className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as DailyEntryCategory)}
                  className="w-full text-xs font-medium pl-8 pr-3 py-1.5 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {allowedCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} Needle
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Search */}
            <div>
              <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Quick Search
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Code, Type, Brand, Req..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 rounded-erp border border-surface-border bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-erp bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Report Metadata Banner (When Loaded) */}
        {!loading && reportData && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800/60 border border-surface-border rounded-erp text-xs text-ink-muted font-medium">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                <b className="text-ink">Floor:</b> {formatFloorDisplayName(reportData.floorName, reportData.locationName)}
              </span>
              <span>•</span>
              <span>
                <b className="text-ink">Date:</b> {reportData.date}
              </span>
              <span>•</span>
              <span>
                <b className="text-ink">Category:</b> {reportData.category}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                DOC: {reportData.documentNo}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-ink">
                VER: {reportData.versionNo}
              </span>
            </div>
          </div>
        )}

        {/* Report Table / Skeleton */}
        {loading ? (
          <ReportSkeleton />
        ) : reportData ? (
          <PresentBalanceTable report={reportData} searchQuery={searchQuery} />
        ) : (
          <div className="border border-surface-border rounded-erp bg-surface p-12 text-center text-ink-muted">
            No report data available.
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PRINT-ONLY OFFICIAL REPORT LAYOUT (Visible only when printing)     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="hidden print:block font-sans text-black bg-white p-0 m-0">
        <style dangerouslySetInnerHTML={{ __html: `
          @page { size: A4 landscape; margin: 6mm; }
          @media print {
            header, aside, nav, [role="banner"], [role="navigation"] { display: none !important; }
            body, html { background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0 !important; padding: 0 !important; }
            main { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          }
        ` }} />

        {reportData && (
          <div className="space-y-3">
            {/* Official Header */}
            <div className="relative text-center border-b pb-2">
              <h1 className="text-xl font-black underline tracking-wide uppercase">
                GMS COMPOSITE KNITTING IND LTD
              </h1>
              <h2 className="text-xs font-bold text-slate-700">SHARDAGONJ, KASHIMPUR, GAZIPUR</h2>
              <h3 className="text-xs font-bold text-blue-600">ACCESSORIES MCD</h3>

              {/* Document No box top right */}
              <div className="absolute top-0 right-0 border border-slate-900 bg-blue-50/50 px-3 py-1.5 text-center text-[10px] font-bold leading-tight">
                <div>DOCUMENT NO : {reportData.documentNo || 'QA/03/310'}</div>
                <div>VERSION NO : {reportData.versionNo || '01/2026'}</div>
              </div>
            </div>

            {/* Official Title Banner */}
            <div className="bg-slate-900 text-white text-center py-1 font-bold text-sm tracking-wider uppercase">
              DAILY SEWING NEEDLE PRESENT BALANCE REPORT
            </div>

            {/* Metadata Line */}
            <div className="bg-slate-100 border border-slate-300 px-3 py-1 text-[10px] font-bold">
              Floor: {formatFloorDisplayName(reportData.floorName, reportData.locationName)}   |   Date: {reportData.date}   |   Category: {reportData.category}
            </div>

            {/* Formal Table */}
            <table className="w-full text-[9px] border-collapse border border-black">
              <thead>
                <tr className="bg-slate-900 text-white font-bold text-center">
                  <th className="border border-black p-1 w-8">SL</th>
                  <th className="border border-black p-1 w-16">CODE</th>
                  <th className="border border-black p-1 text-left">TYPE</th>
                  <th className="border border-black p-1 w-10">SIZE</th>
                  <th className="border border-black p-1 w-16">BRAND</th>
                  <th className="border border-black p-1 text-right w-14">PREVIOUS</th>
                  <th className="border border-black p-1 text-right w-14">RECEIVED</th>
                  <th className="border border-black p-1 w-20">REQ NO</th>
                  <th className="border border-black p-1 text-right w-14">DELIVERY</th>
                  <th className="border border-black p-1 text-right w-20 bg-slate-800 text-amber-300">
                    PRESENT BALANCE
                  </th>
                  <th className="border border-black p-1 text-right w-12">BNR</th>
                  <th className="border border-black p-1 text-left">NOTE</th>
                </tr>
              </thead>
              <tbody>
                {reportData.rows.map((row, i) => (
                  <tr key={row.needle_item_id} className="text-center">
                    <td className="border border-black p-1 font-mono">{i + 1}</td>
                    <td className="border border-black p-1 font-mono font-bold">{row.item_code}</td>
                    <td className="border border-black p-1 text-left">{row.needle_type}</td>
                    <td className="border border-black p-1">{row.size_dia || ''}</td>
                    <td className="border border-black p-1">{row.brand}</td>
                    <td className="border border-black p-1 text-right font-mono">{row.previous.toLocaleString()}</td>
                    <td className="border border-black p-1 text-right font-mono">{row.received.toLocaleString()}</td>
                    <td className="border border-black p-1 font-mono">{row.req_no || ''}</td>
                    <td className="border border-black p-1 text-right font-mono">{row.delivery.toLocaleString()}</td>
                    <td className="border border-black p-1 text-right font-mono font-bold bg-amber-100/90 text-amber-900">
                      {row.present.toLocaleString()}
                    </td>
                    <td className="border border-black p-1 text-right font-mono">{row.bnr.toLocaleString()}</td>
                    <td className="border border-black p-1 text-left">{row.note || ''}</td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="font-bold bg-slate-100 text-black">
                  <td colSpan={5} className="border border-black p-1 text-right bg-slate-200">
                    TOTAL →
                  </td>
                  <td className="border border-black p-1 text-right font-mono">
                    {reportData.summary.totalPrevious.toLocaleString()}
                  </td>
                  <td className="border border-black p-1 text-right font-mono">
                    {reportData.summary.totalReceived.toLocaleString()}
                  </td>
                  <td className="border border-black p-1" />
                  <td className="border border-black p-1 text-right font-mono">
                    {reportData.summary.totalDelivery.toLocaleString()}
                  </td>
                  <td className="border border-black p-1 text-right font-mono font-bold bg-amber-200 text-amber-900">
                    {reportData.summary.totalPresent.toLocaleString()}
                  </td>
                  <td className="border border-black p-1 text-right font-mono">
                    {reportData.summary.totalBnr.toLocaleString()}
                  </td>
                  <td className="border border-black p-1" />
                </tr>
              </tbody>
            </table>

            {/* Signature Section */}
            <div className="pt-16 grid grid-cols-3 gap-8 text-center text-xs font-bold">
              <div>
                <div className="border-t-2 border-black pt-1">PREPARED BY</div>
              </div>
              <div>
                <div className="border-t-2 border-black pt-1">CHECKED BY</div>
              </div>
              <div>
                <div className="border-t-2 border-black pt-1">AUTHORISED BY</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* EXPORT PROGRESS MODAL (Non-blocking with corner minimization)       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <ExportProgressModal
        state={progressModalState}
        onClose={handleCloseModal}
        onRetry={handleRetryExport}
        onDownloadAgain={handleDownloadAgain}
      />
    </div>
  )
}
