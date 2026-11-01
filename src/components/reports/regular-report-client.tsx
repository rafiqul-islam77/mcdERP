'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  FileSpreadsheet,
  FileText,
  Calendar,
  Building2,
  Layers,
  Check,
  ChevronDown,
  CheckSquare,
  Square,
  AlertCircle,
  Search,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ExportProgressModal,
  type ExportProgressState,
  type FloorProgressItem,
} from '@/components/reports/export-progress-modal'
import { getDailyStockReportDataAction } from '@/app/actions/reports'
import { generateMultiReportPresentBalancePDF } from '@/lib/reports/pdf-multi-generator'
import { formatFloorDisplayName } from '@/lib/reports/report-utils'
import type { DailyEntryCategory, DailyReportData, Floor } from '@/types'

interface RegularReportClientProps {
  initialFloors: Floor[]
  allowedCategories: DailyEntryCategory[]
  isSiteAdmin: boolean
}

export function RegularReportClient({
  initialFloors,
  allowedCategories,
  isSiteAdmin: _isSiteAdmin,
}: RegularReportClientProps) {
  const todayStr = new Date().toISOString().slice(0, 10)

  // ---------------------------------------------------------------------------
  // Card 1 State: Daily Stock
  // ---------------------------------------------------------------------------
  const [dsDate, setDsDate] = useState<string>(todayStr)
  const [dsSelectedFloorIds, setDsSelectedFloorIds] = useState<string[]>([])
  const [dsSelectedCategories, setDsSelectedCategories] = useState<DailyEntryCategory[]>(
    allowedCategories.length > 0 ? allowedCategories : ['RUNNING']
  )
  const [dsIncludeSummary, setDsIncludeSummary] = useState<boolean>(true)
  const [dsFloorDropdownOpen, setDsFloorDropdownOpen] = useState<boolean>(false)
  const [dsFloorSearch, setDsFloorSearch] = useState<string>('')

  // ---------------------------------------------------------------------------
  // Card 2 State: Closing Stock
  // ---------------------------------------------------------------------------
  const [csDate, setCsDate] = useState<string>(todayStr)
  const [csSelectedFloorIds, setCsSelectedFloorIds] = useState<string[]>([])
  const [csSelectedCategories, setCsSelectedCategories] = useState<DailyEntryCategory[]>(
    allowedCategories.length > 0 ? allowedCategories : ['RUNNING']
  )
  const [csFloorDropdownOpen, setCsFloorDropdownOpen] = useState<boolean>(false)
  const [csFloorSearch, setCsFloorSearch] = useState<string>('')

  // ---------------------------------------------------------------------------
  // Shared Export State & Progress Modal
  // ---------------------------------------------------------------------------
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [progressModalState, setProgressModalState] = useState<ExportProgressState>({
    isOpen: false,
    exportType: 'present_excel',
    exportName: 'Daily Stock',
    date: todayStr,
    floorLabel: 'Selected Floors',
    isAllFloors: false,
    status: 'idle',
    statusMessage: '',
    currentStep: 1,
    totalSteps: 4,
    progressPercent: 0,
    floorItems: [],
  })

  // Cache last export data for re-downloading
  const lastExportRef = useRef<{
    blob?: Blob
    pdfDoc?: any
    filename: string
    url?: string
  } | null>(null)

  const dsDropdownRef = useRef<HTMLDivElement>(null)
  const csDropdownRef = useRef<HTMLDivElement>(null)

  // Close floor dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dsDropdownRef.current && !dsDropdownRef.current.contains(event.target as Node)) {
        setDsFloorDropdownOpen(false)
      }
      if (csDropdownRef.current && !csDropdownRef.current.contains(event.target as Node)) {
        setCsFloorDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ---------------------------------------------------------------------------
  // Helper: Floor Filtering & Display
  // ---------------------------------------------------------------------------
  const filteredDsFloors = initialFloors.filter((f) => {
    const display = formatFloorDisplayName(f.name, f.floor_locations?.name).toLowerCase()
    return display.includes(dsFloorSearch.toLowerCase())
  })

  const filteredCsFloors = initialFloors.filter((f) => {
    const display = formatFloorDisplayName(f.name, f.floor_locations?.name).toLowerCase()
    return display.includes(csFloorSearch.toLowerCase())
  })

  // ---------------------------------------------------------------------------
  // EXPORT: Daily Stock Excel
  // ---------------------------------------------------------------------------
  const handleExportDailyStockExcel = async () => {
    if (isExporting) return
    setExportError(null)

    if (dsSelectedFloorIds.length === 0) {
      setExportError('Please select at least one Floor for Daily Stock export.')
      return
    }
    if (dsSelectedCategories.length === 0) {
      setExportError('Please select at least one Category for Daily Stock export.')
      return
    }

    const isAll = dsSelectedFloorIds.length === initialFloors.length
    const floorLabel = isAll
      ? 'All Floors'
      : `${dsSelectedFloorIds.length} Floor${dsSelectedFloorIds.length > 1 ? 's' : ''}`
    const filename = `Daily Stock - ${dsDate}.xlsx`
    const selectedFloors = initialFloors.filter((f) => dsSelectedFloorIds.includes(f.id))

    setIsExporting(true)
    setProgressModalState({
      isOpen: true,
      exportType: 'present_excel',
      exportName: 'Daily Stock Excel',
      date: dsDate,
      floorLabel,
      isAllFloors: isAll,
      status: 'running',
      statusMessage: 'Preparing Daily Stock report...',
      currentStep: 1,
      totalSteps: 4,
      progressPercent: 5,
      itemsLabel: `${selectedFloors.length} Floor${selectedFloors.length > 1 ? 's' : ''}`,
      floorItems: [],
      downloadFilename: filename,
    })

    try {
      // Direct single-pass generation via batch API endpoint (Steps 1+2+3)
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Generating multi-sheet Excel workbook...',
        progressPercent: 45,
        currentStep: 2,
      }))

      const floorIdsQuery = isAll ? 'all' : dsSelectedFloorIds.join(',')
      const categoriesQuery = dsSelectedCategories.join(',')
      const url = `/api/reports/regular-daily-stock-excel?date=${encodeURIComponent(
        dsDate
      )}&floorIds=${encodeURIComponent(floorIdsQuery)}&categories=${encodeURIComponent(
        categoriesQuery
      )}&summary=${dsIncludeSummary}`

      const res = await fetch(url)
      if (!res.ok) {
        let errText = 'Failed to generate Daily Stock Excel'
        try {
          const errJson = await res.json()
          if (errJson.error) errText = errJson.error
        } catch {}
        throw new Error(errText)
      }

      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Finalizing file...',
        progressPercent: 95,
        currentStep: 3,
      }))

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)

      lastExportRef.current = {
        blob,
        filename,
        url: objectUrl,
      }

      // Auto trigger download
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setProgressModalState((prev) => ({
        ...prev,
        status: 'completed',
        statusMessage: 'Generation Complete ✓',
        progressPercent: 100,
        downloadUrl: objectUrl,
      }))
    } catch (err: any) {
      const msg = err.message || 'Export failed. Please try again.'
      setExportError(msg)
      setProgressModalState((prev) => ({
        ...prev,
        status: 'failed',
        statusMessage: 'Export Failed',
        errorMessage: msg,
      }))
    } finally {
      setIsExporting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // EXPORT: Daily Stock PDF
  // ---------------------------------------------------------------------------
  const handleExportDailyStockPdf = async () => {
    if (isExporting) return
    setExportError(null)

    if (dsSelectedFloorIds.length === 0) {
      setExportError('Please select at least one Floor for Daily Stock PDF export.')
      return
    }
    if (dsSelectedCategories.length === 0) {
      setExportError('Please select at least one Category for Daily Stock PDF export.')
      return
    }

    const isAll = dsSelectedFloorIds.length === initialFloors.length
    const floorLabel = isAll
      ? 'All Floors'
      : `${dsSelectedFloorIds.length} Floor${dsSelectedFloorIds.length > 1 ? 's' : ''}`
    const filename = `Daily Stock - ${dsDate}.pdf`

    setIsExporting(true)
    const selectedFloors = initialFloors.filter((f) => dsSelectedFloorIds.includes(f.id))

    setProgressModalState({
      isOpen: true,
      exportType: 'pdf',
      exportName: 'Daily Stock PDF',
      date: dsDate,
      floorLabel,
      isAllFloors: isAll,
      status: 'running',
      statusMessage: 'Preparing PDF reports...',
      currentStep: 1,
      totalSteps: 4,
      progressPercent: 5,
      itemsLabel: `${selectedFloors.length} Floors (${dsSelectedCategories.length} categories)`,
      floorItems: [],
      downloadFilename: filename,
    })

    try {
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Fetching report data in batch...',
        progressPercent: 30,
        currentStep: 2,
      }))

      const repRes = await getDailyStockReportDataAction({ date: dsDate })
      if (!repRes.success || !repRes.data) {
        throw new Error(repRes.error || 'Failed to fetch report data.')
      }

      const reports: DailyReportData[] = []
      for (const floor of selectedFloors) {
        for (const cat of dsSelectedCategories) {
          let pool: DailyReportData[] = []
          if (cat === 'RUNNING') pool = repRes.data.runningReports || []
          else if (cat === 'NEW') pool = repRes.data.newReports || []
          else if (cat === 'IDLE') pool = repRes.data.idleReports || []

          const match = pool.find((r) => r.floorId === floor.id)
          if (match) {
            reports.push(match)
          }
        }
      }

      if (reports.length === 0) {
        throw new Error('No report data found for the selected criteria.')
      }

      const floorItems: FloorProgressItem[] = selectedFloors.map((floor) => {
        const floorReps = reports.filter((r) => r.floorId === floor.id)
        const itemsCount = floorReps.reduce((sum, r) => sum + r.rows.length, 0)
        const presentStock = floorReps.reduce((sum, r) => sum + r.summary.totalPresent, 0)
        return {
          id: floor.id,
          floorName: formatFloorDisplayName(floor.name, floor.floor_locations?.name),
          date: dsDate,
          itemsCount,
          presentStock,
          source: 'actual' as const,
        }
      })

      setProgressModalState((prev) => ({
        ...prev,
        floorItems,
      }))

      // Step: Rendering PDF
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: `Rendering ${reports.length} report section(s) to PDF...`,
        progressPercent: 85,
        currentStep: 3,
      }))

      await new Promise((r) => setTimeout(r, 60))
      const pdf = generateMultiReportPresentBalancePDF(reports, {
        includeSummary: dsIncludeSummary,
        date: dsDate,
      })

      // Step: Finalizing
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Finalizing PDF file...',
        progressPercent: 95,
        currentStep: 4,
      }))

      await new Promise((r) => setTimeout(r, 60))
      pdf.save(filename)

      lastExportRef.current = {
        pdfDoc: pdf,
        filename,
      }

      setProgressModalState((prev) => ({
        ...prev,
        status: 'completed',
        statusMessage: 'Generation Complete ✓',
        progressPercent: 100,
      }))
    } catch (err: any) {
      const msg = err.message || 'PDF export failed. Please try again.'
      setExportError(msg)
      setProgressModalState((prev) => ({
        ...prev,
        status: 'failed',
        statusMessage: 'Export Failed',
        errorMessage: msg,
      }))
    } finally {
      setIsExporting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // EXPORT: Closing Stock Excel
  // ---------------------------------------------------------------------------
  const handleExportClosingStockExcel = async () => {
    if (isExporting) return
    setExportError(null)

    if (csSelectedFloorIds.length === 0) {
      setExportError('Please select at least one Floor for Closing Stock export.')
      return
    }
    if (csSelectedCategories.length === 0) {
      setExportError('Please select at least one Category for Closing Stock export.')
      return
    }

    const isAll = csSelectedFloorIds.length === initialFloors.length
    const floorLabel = isAll
      ? 'All Floors'
      : `${csSelectedFloorIds.length} Floor${csSelectedFloorIds.length > 1 ? 's' : ''}`
    const filename = `Closing Stock - ${csDate}.xlsx`

    setIsExporting(true)
    const selectedFloors = initialFloors.filter((f) => csSelectedFloorIds.includes(f.id))

    setProgressModalState({
      isOpen: true,
      exportType: 'stock_excel',
      exportName: 'Closing Stock Excel',
      date: csDate,
      floorLabel,
      isAllFloors: isAll,
      status: 'running',
      statusMessage: 'Preparing Closing Stock report...',
      currentStep: 1,
      totalSteps: 4,
      progressPercent: 5,
      itemsLabel: `${selectedFloors.length} Floor${selectedFloors.length > 1 ? 's' : ''}`,
      floorItems: [],
      downloadFilename: filename,
    })

    try {
      // Direct single-pass generation via batch API endpoint (Steps 1+2+3)
      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Generating Closing Stock workbook...',
        progressPercent: 45,
        currentStep: 2,
      }))

      const floorIdsQuery = isAll ? 'all' : csSelectedFloorIds.join(',')
      const categoriesQuery = csSelectedCategories.join(',')
      const url = `/api/reports/regular-closing-stock-excel?date=${encodeURIComponent(
        csDate
      )}&floorIds=${encodeURIComponent(floorIdsQuery)}&categories=${encodeURIComponent(
        categoriesQuery
      )}`

      const res = await fetch(url)
      if (!res.ok) {
        let errText = 'Failed to generate Closing Stock Excel'
        try {
          const errJson = await res.json()
          if (errJson.error) errText = errJson.error
        } catch {}
        throw new Error(errText)
      }

      setProgressModalState((prev) => ({
        ...prev,
        statusMessage: 'Finalizing file...',
        progressPercent: 95,
        currentStep: 3,
      }))

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)

      lastExportRef.current = {
        blob,
        filename,
        url: objectUrl,
      }

      // Auto trigger download
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setProgressModalState((prev) => ({
        ...prev,
        status: 'completed',
        statusMessage: 'Generation Complete ✓',
        progressPercent: 100,
        downloadUrl: objectUrl,
      }))
    } catch (err: any) {
      const msg = err.message || 'Export failed. Please try again.'
      setExportError(msg)
      setProgressModalState((prev) => ({
        ...prev,
        status: 'failed',
        statusMessage: 'Export Failed',
        errorMessage: msg,
      }))
    } finally {
      setIsExporting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Modal Handlers (Close, Retry, Download Again)
  // ---------------------------------------------------------------------------
  const handleCloseModal = () => {
    setProgressModalState((prev) => ({ ...prev, isOpen: false }))
  }

  const handleRetryExport = () => {
    if (progressModalState.exportType === 'stock_excel') {
      handleExportClosingStockExcel()
    } else if (progressModalState.exportType === 'present_excel') {
      handleExportDailyStockExcel()
    } else if (progressModalState.exportType === 'pdf') {
      handleExportDailyStockPdf()
    }
  }

  const handleDownloadAgain = () => {
    if (!lastExportRef.current) return
    const { blob, pdfDoc, filename, url } = lastExportRef.current

    if (blob && url) {
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else if (pdfDoc) {
      pdfDoc.save(filename)
    }
  }

  // ---------------------------------------------------------------------------
  // Category Color Badges
  // ---------------------------------------------------------------------------
  const getCategoryBadgeClass = (category: DailyEntryCategory, isSelected: boolean) => {
    if (!isSelected) {
      return 'bg-surface-muted text-ink-muted border-surface-border hover:bg-surface-elevated'
    }
    switch (category) {
      case 'RUNNING':
        return 'bg-blue-600 text-white border-blue-600 shadow-sm'
      case 'NEW':
        return 'bg-purple-600 text-white border-purple-600 shadow-sm'
      case 'IDLE':
        return 'bg-amber-600 text-white border-amber-600 shadow-sm'
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header section */}
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="info" className="text-xs">
            Report Studio
          </Badge>
          <span className="text-xs text-ink-muted font-medium">Regular Reports</span>
        </div>
        <h1 className="text-2xl font-bold text-ink mt-1">Daily Reports</h1>
        <p className="text-sm text-ink-muted">
          Generate and export official Daily Stock and Closing Stock operational reports in multi-sheet Excel
          and high-fidelity vector PDF formats.
        </p>
      </div>

      {/* Global error alert if validation or network issue */}
      {exportError && (
        <div className="p-4 rounded-erp-md bg-danger/10 border border-danger/30 text-danger-dark text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Export Notification: </span>
            {exportError}
          </div>
          <button
            onClick={() => setExportError(null)}
            className="text-xs hover:underline font-medium text-danger-dark"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2-Column Responsive Report Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* =================================================================== */}
        {/* CARD 1: DAILY STOCK                                                */}
        {/* =================================================================== */}
        <Card
          title={
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-erp-md bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                📊
              </div>
              <div>
                <span className="text-base font-bold text-ink">Daily Stock</span>
                <span className="block text-xs font-normal text-ink-muted">
                  Present Balance operational ledger with physical stock & adjustments
                </span>
              </div>
            </div>
          }
          className="border-surface-border shadow-erp hover:shadow-erp-md transition-shadow"
        >
          <div className="space-y-4">
            {/* 1. Date Selector */}
            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Report Date
              </label>
              <input
                type="date"
                value={dsDate}
                onChange={(e) => setDsDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-surface-border rounded-erp-md bg-surface-card text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {/* 2. Floor Multi-Select */}
            <div className="relative" ref={dsDropdownRef}>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  Select Floors
                </span>
                <span className="text-xs font-normal text-ink-muted">
                  {dsSelectedFloorIds.length === 0
                    ? 'None selected'
                    : dsSelectedFloorIds.length === initialFloors.length
                    ? 'All Floors selected'
                    : `${dsSelectedFloorIds.length} of ${initialFloors.length} selected`}
                </span>
              </label>

              {/* Toggle Dropdown Button */}
              <button
                type="button"
                onClick={() => setDsFloorDropdownOpen((prev) => !prev)}
                className="w-full px-3 py-2 text-sm border border-surface-border rounded-erp-md bg-surface-card text-ink flex items-center justify-between hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <span className="truncate">
                  {dsSelectedFloorIds.length === 0
                    ? 'Select Floors...'
                    : dsSelectedFloorIds.length === initialFloors.length
                    ? 'All Floors (Complete Building)'
                    : `${dsSelectedFloorIds.length} Floor(s) selected`}
                </span>
                <ChevronDown className="w-4 h-4 text-ink-muted ml-2 shrink-0" />
              </button>

              {/* Dropdown Popover */}
              {dsFloorDropdownOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-erp-md shadow-erp-lg p-2 max-h-64 flex flex-col">
                  {/* Search box & Select all toggle */}
                  <div className="p-1 border-b border-surface-border mb-1 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-ink-muted" />
                      <input
                        type="text"
                        placeholder="Filter floors..."
                        value={dsFloorSearch}
                        onChange={(e) => setDsFloorSearch(e.target.value)}
                        className="w-full pl-7 pr-2 py-1 text-xs border border-surface-border rounded bg-surface-elevated text-ink focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (dsSelectedFloorIds.length === initialFloors.length) {
                          setDsSelectedFloorIds([])
                        } else {
                          setDsSelectedFloorIds(initialFloors.map((f) => f.id))
                        }
                      }}
                      className="text-xs font-semibold text-brand hover:underline shrink-0 px-1"
                    >
                      {dsSelectedFloorIds.length === initialFloors.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  </div>

                  {/* Floor Items List */}
                  <div className="overflow-y-auto space-y-1 flex-1 pr-1">
                    {filteredDsFloors.map((floor) => {
                      const isSelected = dsSelectedFloorIds.includes(floor.id)
                      const displayName = formatFloorDisplayName(
                        floor.name,
                        floor.floor_locations?.name
                      )
                      return (
                        <div
                          key={floor.id}
                          onClick={() => {
                            setDsSelectedFloorIds((prev) =>
                              isSelected ? prev.filter((id) => id !== floor.id) : [...prev, floor.id]
                            )
                          }}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                            isSelected
                              ? 'bg-brand/10 text-brand font-medium'
                              : 'hover:bg-surface-elevated text-ink'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-ink-muted shrink-0" />
                          )}
                          <span className="truncate">{displayName}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Category Multi-Select */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Categories
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (dsSelectedCategories.length === allowedCategories.length) {
                      setDsSelectedCategories([])
                    } else {
                      setDsSelectedCategories([...allowedCategories])
                    }
                  }}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  {dsSelectedCategories.length === allowedCategories.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {allowedCategories.map((cat) => {
                  const isSelected = dsSelectedCategories.includes(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setDsSelectedCategories((prev) =>
                          isSelected ? prev.filter((c) => c !== cat) : [...prev, cat]
                        )
                      }}
                      className={`px-3 py-1.5 rounded-erp-md text-xs font-semibold border flex items-center gap-1.5 transition-all ${getCategoryBadgeClass(
                        cat,
                        isSelected
                      )}`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      {cat} NEEDLE
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 4. SUMMARY Sheet Checkbox */}
            <div className="pt-2 border-t border-surface-border">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dsIncludeSummary}
                  onChange={(e) => setDsIncludeSummary(e.target.checked)}
                  className="mt-0.5 rounded border-surface-border text-brand focus:ring-brand"
                />
                <div className="text-xs">
                  <span className="font-semibold text-ink">Include SUMMARY Sheet</span>
                  <p className="text-ink-muted text-[11px] leading-relaxed mt-0.5">
                    Generates an aggregated executive summary worksheet as the first tab with grand totals
                    across all selected floors and categories.
                  </p>
                </div>
              </label>
            </div>

            {/* 5. Export Action Buttons */}
            <div className="pt-3 border-t border-surface-border flex items-center gap-3">
              <Button
                variant="primary"
                onClick={handleExportDailyStockExcel}
                disabled={isExporting}
                className="flex-1 text-xs font-semibold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export Excel
              </Button>

              <Button
                variant="outline"
                onClick={handleExportDailyStockPdf}
                disabled={isExporting}
                className="flex-1 text-xs font-semibold flex items-center justify-center gap-2 border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <FileText className="w-4 h-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </Card>

        {/* =================================================================== */}
        {/* CARD 2: CLOSING STOCK                                              */}
        {/* =================================================================== */}
        <Card
          title={
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-erp-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                📈
              </div>
              <div>
                <span className="text-base font-bold text-ink">Closing Stock</span>
                <span className="block text-xs font-normal text-ink-muted">
                  End-of-day stock audit reconciliation (Sewing Needle + Idle Needle)
                </span>
              </div>
            </div>
          }
          className="border-surface-border shadow-erp hover:shadow-erp-md transition-shadow"
        >
          <div className="space-y-4">
            {/* 1. Date Selector */}
            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                Report Date
              </label>
              <input
                type="date"
                value={csDate}
                onChange={(e) => setCsDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-surface-border rounded-erp-md bg-surface-card text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {/* 2. Floor Multi-Select */}
            <div className="relative" ref={csDropdownRef}>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  Select Floors
                </span>
                <span className="text-xs font-normal text-ink-muted">
                  {csSelectedFloorIds.length === 0
                    ? 'None selected'
                    : csSelectedFloorIds.length === initialFloors.length
                    ? 'All Floors selected'
                    : `${csSelectedFloorIds.length} of ${initialFloors.length} selected`}
                </span>
              </label>

              {/* Toggle Dropdown Button */}
              <button
                type="button"
                onClick={() => setCsFloorDropdownOpen((prev) => !prev)}
                className="w-full px-3 py-2 text-sm border border-surface-border rounded-erp-md bg-surface-card text-ink flex items-center justify-between hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <span className="truncate">
                  {csSelectedFloorIds.length === 0
                    ? 'Select Floors...'
                    : csSelectedFloorIds.length === initialFloors.length
                    ? 'All Floors (Complete Building)'
                    : `${csSelectedFloorIds.length} Floor(s) selected`}
                </span>
                <ChevronDown className="w-4 h-4 text-ink-muted ml-2 shrink-0" />
              </button>

              {/* Dropdown Popover */}
              {csFloorDropdownOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-erp-md shadow-erp-lg p-2 max-h-64 flex flex-col">
                  {/* Search box & Select all toggle */}
                  <div className="p-1 border-b border-surface-border mb-1 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-ink-muted" />
                      <input
                        type="text"
                        placeholder="Filter floors..."
                        value={csFloorSearch}
                        onChange={(e) => setCsFloorSearch(e.target.value)}
                        className="w-full pl-7 pr-2 py-1 text-xs border border-surface-border rounded bg-surface-elevated text-ink focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (csSelectedFloorIds.length === initialFloors.length) {
                          setCsSelectedFloorIds([])
                        } else {
                          setCsSelectedFloorIds(initialFloors.map((f) => f.id))
                        }
                      }}
                      className="text-xs font-semibold text-brand hover:underline shrink-0 px-1"
                    >
                      {csSelectedFloorIds.length === initialFloors.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  </div>

                  {/* Floor Items List */}
                  <div className="overflow-y-auto space-y-1 flex-1 pr-1">
                    {filteredCsFloors.map((floor) => {
                      const isSelected = csSelectedFloorIds.includes(floor.id)
                      const displayName = formatFloorDisplayName(
                        floor.name,
                        floor.floor_locations?.name
                      )
                      return (
                        <div
                          key={floor.id}
                          onClick={() => {
                            setCsSelectedFloorIds((prev) =>
                              isSelected ? prev.filter((id) => id !== floor.id) : [...prev, floor.id]
                            )
                          }}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                            isSelected
                              ? 'bg-brand/10 text-brand font-medium'
                              : 'hover:bg-surface-elevated text-ink'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-ink-muted shrink-0" />
                          )}
                          <span className="truncate">{displayName}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Category Multi-Select */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  Categories
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (csSelectedCategories.length === allowedCategories.length) {
                      setCsSelectedCategories([])
                    } else {
                      setCsSelectedCategories([...allowedCategories])
                    }
                  }}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  {csSelectedCategories.length === allowedCategories.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {allowedCategories.map((cat) => {
                  const isSelected = csSelectedCategories.includes(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCsSelectedCategories((prev) =>
                          isSelected ? prev.filter((c) => c !== cat) : [...prev, cat]
                        )
                      }}
                      className={`px-3 py-1.5 rounded-erp-md text-xs font-semibold border flex items-center gap-1.5 transition-all ${getCategoryBadgeClass(
                        cat,
                        isSelected
                      )}`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      {cat} NEEDLE
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Helper notes for Closing Stock */}
            <div className="pt-2 border-t border-surface-border">
              <div className="p-2.5 rounded bg-surface-elevated border border-surface-border text-[11px] text-ink-muted leading-relaxed">
                ℹ️ Closing Stock generates standard <strong>SEWING NEEDLE</strong> and{' '}
                <strong>IDLE NEEDLE</strong> audit worksheets with exact previous, received, delivery, and
                closing balance columns matching company standards.
              </div>
            </div>

            {/* 4. Export Action Button */}
            <div className="pt-3 border-t border-surface-border">
              <Button
                variant="primary"
                onClick={handleExportClosingStockExcel}
                disabled={isExporting}
                className="w-full text-xs font-semibold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export Closing Stock Excel
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Reusable Non-blocking Export Progress Modal */}
      <ExportProgressModal
        state={progressModalState}
        onClose={handleCloseModal}
        onRetry={handleRetryExport}
        onDownloadAgain={handleDownloadAgain}
      />
    </div>
  )
}
