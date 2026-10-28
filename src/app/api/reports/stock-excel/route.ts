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

  // Format date DD-MM-YYYY as in reference: STOCK REPORT 20-10-2026.xlsx
  const dateParts = date.split('-')
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : date
  const filename = `STOCK REPORT ${formattedDate}.xlsx`

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
