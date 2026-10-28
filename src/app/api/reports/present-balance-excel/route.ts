import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFull } from '@/lib/auth'
import { getDailyReportAction, getAllFloorsDailyReportAction } from '@/app/actions/reports'
import { generatePresentBalanceWorkbook } from '@/lib/reports/excel-present-balance'
import type { DailyEntryCategory, DailyReportData } from '@/types'

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFull()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const floorId = searchParams.get('floorId') || 'all'
  const category = (searchParams.get('category')?.toUpperCase() || 'RUNNING') as DailyEntryCategory

  // Check export permissions
  const permKey =
    category === 'NEW'
      ? 'broken.daily_report.export_present_excel'
      : category === 'IDLE'
      ? 'idle.daily_report.export_present_excel'
      : 'needle.daily_report.export_present_excel'

  const hasPerm =
    user.isSiteAdmin ||
    user.permissions.includes(permKey) ||
    user.permissions.includes('daily_report.export_present_excel') ||
    user.permissions.includes('needle.daily_report.export') ||
    user.permissions.includes('broken.daily_report.export') ||
    user.permissions.includes('idle.daily_report.export')

  if (!hasPerm) {
    return NextResponse.json({ error: 'Forbidden: Present balance export permission denied' }, { status: 403 })
  }

  let reports: DailyReportData[] = []
  let filename = `GMS-Needle-PresentBalance-AllFloors-${date}.xlsx`

  if (floorId === 'all') {
    const res = await getAllFloorsDailyReportAction({ date, category })
    if (!res.success || !res.data) {
      return NextResponse.json({ error: res.error || 'Failed to generate report' }, { status: 500 })
    }
    reports = res.data
  } else {
    const res = await getDailyReportAction({ date, floorId, category })
    if (!res.success || !res.data) {
      return NextResponse.json({ error: res.error || 'Failed to generate report' }, { status: 500 })
    }
    reports = [res.data]
    const cleanFloor = (res.data.floorCode || res.data.floorName).replace(/\s+/g, '-')
    filename = `GMS-Needle-PresentBalance-${cleanFloor}-${category}-${date}.xlsx`
  }

  if (reports.length === 0) {
    return NextResponse.json({ error: 'No data available for export' }, { status: 404 })
  }

  const buffer = await generatePresentBalanceWorkbook(reports)

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
