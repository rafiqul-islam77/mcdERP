import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getCurrentUserFull } from '@/lib/auth'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { getBatchDailyReportData } from '@/lib/reports/daily-report-service'
import { buildPresentBalanceSheet } from '@/lib/reports/excel-present-balance'
import { buildSummarySheet } from '@/lib/reports/excel-summary-sheet'
import type { DailyEntryCategory, Floor } from '@/types'

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFull()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Permission check
  const hasPerm =
    user.isSiteAdmin ||
    user.permissions.includes('report_studio.regular.view') ||
    user.permissions.includes('daily_report.export_present_excel') ||
    user.permissions.includes('needle.daily_report.export_present_excel') ||
    user.permissions.includes('broken.daily_report.export_present_excel') ||
    user.permissions.includes('idle.daily_report.export_present_excel') ||
    user.permissions.includes('needle.daily_report.export') ||
    user.permissions.includes('broken.daily_report.export') ||
    user.permissions.includes('idle.daily_report.export')

  if (!hasPerm) {
    return NextResponse.json(
      { error: 'Forbidden: Regular reports export permission denied' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const floorIdsParam = searchParams.get('floorIds') || 'all'
  const categoriesParam = searchParams.get('categories') || 'RUNNING,NEW'
  const includeSummary = searchParams.get('summary') !== 'false'

  // Get authorized floors for this user
  const contextRes = await getAuthorizedContextAction()
  if (!contextRes.success || !contextRes.data) {
    return NextResponse.json(
      { error: contextRes.error || 'Failed to load authorized floors.' },
      { status: 500 }
    )
  }

  const allAuthFloors: Floor[] = contextRes.data.floors
  let targetFloors: Floor[] = allAuthFloors

  if (floorIdsParam !== 'all') {
    const requestedIds = new Set(floorIdsParam.split(',').map((id) => id.trim()))
    targetFloors = allAuthFloors.filter((f) => requestedIds.has(f.id))
  }

  if (targetFloors.length === 0) {
    return NextResponse.json({ error: 'No authorized floors selected' }, { status: 400 })
  }

  // Parse categories
  const rawCategories = categoriesParam.split(',').map((c) => c.trim().toUpperCase())
  const validCategories: DailyEntryCategory[] = []
  for (const c of rawCategories) {
    if (c === 'RUNNING' || c === 'NEW' || c === 'IDLE') {
      validCategories.push(c as DailyEntryCategory)
    }
  }

  if (validCategories.length === 0) {
    return NextResponse.json({ error: 'No valid categories selected' }, { status: 400 })
  }

  // Fetch authoritative batch reports in a single bulk query (optimized Steps 1+2+3)
  const targetFloorIds = targetFloors.map((f) => f.id)
  const batchRes = await getBatchDailyReportData({
    date,
    floorIds: targetFloorIds,
    categories: validCategories,
  })

  if (!batchRes.success || !batchRes.data) {
    return NextResponse.json(
      { error: batchRes.error || 'Failed to fetch report data' },
      { status: 500 }
    )
  }

  const reports = batchRes.data

  if (reports.length === 0) {
    return NextResponse.json({ error: 'No report data found for selected criteria' }, { status: 404 })
  }

  // Create ExcelJS workbook
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GMS MCD ERP'
  workbook.lastModifiedBy = 'GMS MCD ERP'
  workbook.created = new Date()
  workbook.modified = new Date()

  // 1. Prepend SUMMARY worksheet if requested
  if (includeSummary) {
    buildSummarySheet(workbook, reports, date)
  }

  // 2. Add individual worksheet for each report
  for (const report of reports) {
    buildPresentBalanceSheet(workbook, report)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const bufferArray = Buffer.from(buffer)

  let filename = `Daily Stock - ${date}.xlsx`
  if (targetFloors.length === 1 && validCategories.length === 1) {
    const floorLabel = (reports[0]?.floorCode || reports[0]?.floorName || 'Floor').replace(
      /[/\\?*:[\]<>|"]/g,
      '-'
    )
    filename = `Daily Stock - ${floorLabel} - ${validCategories[0]} - ${date}.xlsx`
  } else if (floorIdsParam === 'all' && targetFloors.length === allAuthFloors.length) {
    filename = `Daily Stock - All Floors - ${date}.xlsx`
  }

  return new NextResponse(new Uint8Array(bufferArray), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Content-Length': bufferArray.byteLength.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
