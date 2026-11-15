import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { getAuthorizedMonthlyReportContextAction } from '@/app/actions/reports'
import { MonthlyReportClient } from '@/components/reports/monthly-report-client'
import { Metadata } from 'next'
import type { DailyEntryCategory } from '@/types'

export const metadata: Metadata = {
  title: 'Monthly Report (Idle Needle) | GMS ERP',
}

export default async function IdleNeedleMonthlyReportPage() {
  const user = await requireActiveAccount()
  if (!user.isSiteAdmin) {
    await requirePermission(user.profile.id, 'idle.monthly_report.view')
  }

  const contextRes = await getAuthorizedMonthlyReportContextAction()
  const floors = contextRes.success && contextRes.data ? contextRes.data.floors : []
  const allowedCategories: DailyEntryCategory[] =
    contextRes.success && contextRes.data ? contextRes.data.allowedCategories : ['IDLE']

  return (
    <MonthlyReportClient
      defaultCategory="IDLE"
      initialFloors={floors}
      allowedCategories={allowedCategories}
      userPermissions={user.permissions || []}
      isSiteAdmin={user.isSiteAdmin}
    />
  )
}
