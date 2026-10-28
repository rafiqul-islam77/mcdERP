import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFull } from '@/lib/auth'
import { getDailyStockReportDataAction } from '@/app/actions/reports'
import { generateDailyStockReportWorkbook } from '@/lib/reports/excel-stock-report'

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFull()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const floorId = searchParams.get('floorId') || 'all'

  // Permission check
  const hasPerm =
    user.isSiteAdmin ||
    user.permissions.includes('daily_report.export_stock_excel') ||
    user.permissions.includes('needle.daily_report.export_stock_excel') ||
    user.permissions.includes('broken.daily_report.export_stock_excel') ||
    user.permissions.includes('idle.daily_report.export_stock_excel') ||
    user.permissions.includes('needle.daily_report.export')

  if (!hasPerm) {
    return NextResponse.json({ error: 'Forbidden: Stock report export permission denied' }, { status: 403 })
  }

  const stockDataRes = await getDailyStockReportDataAction({ date, floorId })
  if (!stockDataRes.success || !stockDataRes.data) {
    return NextResponse.json({ error: stockDataRes.error || 'Failed to generate stock report' }, { status: 500 })
  }

  const buffer = await generateDailyStockReportWorkbook({
    date,
    newReports: stockDataRes.data.newReports,
    runningReports: stockDataRes.data.runningReports,
    idleReports: stockDataRes.data.idleReports,
  })

  let floorLabel = 'All Floors'
  if (floorId !== 'all') {
    const firstRep =
      stockDataRes.data.runningReports[0] ||
      stockDataRes.data.newReports[0] ||
      stockDataRes.data.idleReports[0]
    floorLabel = firstRep ? (firstRep.floorCode || firstRep.floorName) : 'Floor'
  }
  const safeFloor = floorLabel.replace(/[/\\?*:[\]<>|"]/g, '-').trim()
  const filename = `Closing Stock - ${safeFloor} - ${date}.xlsx`

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
