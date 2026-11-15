import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getCurrentUserFull } from '@/lib/auth'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import {
  getBatchMonthlyReportData,
  getMonthBoundaries,
} from '@/lib/reports/monthly-report-service'
import {
  buildMonthlyBalanceSheet,
  buildMonthlySummarySheet,
} from '@/lib/reports/excel-monthly-report'
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
    user.permissions.includes('monthly_report.view') ||
    user.permissions.includes('monthly_report.export_excel') ||
    user.permissions.includes('needle.monthly_report.export_excel') ||
    user.permissions.includes('broken.monthly_report.export_excel') ||
    user.permissions.includes('idle.monthly_report.export_excel') ||
    user.permissions.includes('needle.monthly_report.export') ||
    user.permissions.includes('broken.monthly_report.export') ||
    user.permissions.includes('idle.monthly_report.export')

  if (!hasPerm) {
    return NextResponse.json(
      { error: 'Forbidden: Regular reports export permission denied' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthParam = searchParams.get('month') || defaultMonth
  const boundaries = getMonthBoundaries(monthParam)
  const { monthString, monthLabel } = boundaries

  const floorIdsParam = searchParams.get('floorIds') || 'all'
  const categoriesParam = searchParams.get('categories') || 'RUNNING,NEW'
  const includeSummary = searchParams.get('summary') !== 'false'

  // Get authorized floors
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

  // Fetch batch reports
  const targetFloorIds = targetFloors.map((f) => f.id)
  const batchRes = await getBatchMonthlyReportData({
    month: monthString,
    floorIds: targetFloorIds,
    categories: validCategories,
  })

  if (!batchRes.success || !batchRes.data) {
    return NextResponse.json(
      { error: batchRes.error || 'Failed to fetch monthly report data' },
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
    buildMonthlySummarySheet(workbook, reports, monthLabel)
  }

  // 2. Add individual worksheet for each report
  for (const report of reports) {
    buildMonthlyBalanceSheet(workbook, report)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const bufferArray = Buffer.from(buffer)

  let filename = `Monthly Stock - ${monthString}.xlsx`
  if (targetFloors.length === 1 && validCategories.length === 1) {
    const floorLabel = (reports[0]?.floorCode || reports[0]?.floorName || 'Floor').replace(
      /[/\\?*:[\]<>|"]/g,
      '-'
    )
    filename = `Monthly Stock - ${floorLabel} - ${validCategories[0]} - ${monthString}.xlsx`
  } else if (floorIdsParam === 'all' && targetFloors.length === allAuthFloors.length) {
    filename = `Monthly Stock - All Floors - ${monthString}.xlsx`
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
