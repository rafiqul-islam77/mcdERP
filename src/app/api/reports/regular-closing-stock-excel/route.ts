import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFull } from '@/lib/auth'
import { getDailyStockReportDataAction } from '@/app/actions/reports'
import { generateDailyStockReportWorkbook } from '@/lib/reports/excel-stock-report'
import type { DailyEntryCategory } from '@/types'

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFull()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Permission check
  const hasPerm =
    user.isSiteAdmin ||
    user.permissions.includes('report_studio.regular.view') ||
    user.permissions.includes('daily_report.export_stock_excel') ||
    user.permissions.includes('needle.daily_report.export_stock_excel') ||
    user.permissions.includes('broken.daily_report.export_stock_excel') ||
    user.permissions.includes('idle.daily_report.export_stock_excel') ||
    user.permissions.includes('needle.daily_report.export')

  if (!hasPerm) {
    return NextResponse.json(
      { error: 'Forbidden: Closing stock report export permission denied' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const floorIdsParam = searchParams.get('floorIds') || 'all'
  const categoriesParam = searchParams.get('categories') || 'RUNNING,NEW,IDLE'

  const requestedFloorIds =
    floorIdsParam !== 'all'
      ? floorIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined

  const requestedCategories = categoriesParam
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is DailyEntryCategory => ['RUNNING', 'NEW', 'IDLE'].includes(c as any))

  // Fetch stock report datasets
  const stockDataRes = await getDailyStockReportDataAction({
    date,
    floorIds: requestedFloorIds,
    categories: requestedCategories.length > 0 ? requestedCategories : undefined,
  })
  if (!stockDataRes.success || !stockDataRes.data) {
    return NextResponse.json(
      { error: stockDataRes.error || 'Failed to generate stock report data' },
      { status: 500 }
    )
  }

  let { newReports, runningReports, idleReports } = stockDataRes.data

  // Filter by selected floors if not "all"
  if (floorIdsParam !== 'all') {
    const requestedFloorIds = new Set(floorIdsParam.split(',').map((id) => id.trim()))
    newReports = newReports.filter((r) => requestedFloorIds.has(r.floorId))
    runningReports = runningReports.filter((r) => requestedFloorIds.has(r.floorId))
    idleReports = idleReports.filter((r) => requestedFloorIds.has(r.floorId))
  }

  // Filter by selected categories
  const selectedCategories = new Set(
    categoriesParam.split(',').map((c) => c.trim().toUpperCase())
  )

  if (!selectedCategories.has('NEW')) {
    newReports = []
  }
  if (!selectedCategories.has('RUNNING')) {
    runningReports = []
  }
  if (!selectedCategories.has('IDLE')) {
    idleReports = []
  }

  if (newReports.length === 0 && runningReports.length === 0 && idleReports.length === 0) {
    return NextResponse.json(
      { error: 'No data available for the selected floors and categories' },
      { status: 404 }
    )
  }

  const buffer = await generateDailyStockReportWorkbook({
    date,
    newReports,
    runningReports,
    idleReports,
  })

  let filename = `Closing Stock - ${date}.xlsx`
  if (floorIdsParam !== 'all' && !floorIdsParam.includes(',')) {
    const firstRep = runningReports[0] || newReports[0] || idleReports[0]
    const floorLabel = firstRep ? firstRep.floorCode || firstRep.floorName : 'Floor'
    const safeFloor = floorLabel.replace(/[/\\?*:[\]<>|"]/g, '-').trim()
    filename = `Closing Stock - ${safeFloor} - ${date}.xlsx`
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Content-Length': buffer.byteLength.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
