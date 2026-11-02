import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { getAuthorizedDailyReportContextAction } from '@/app/actions/reports'
import { DailyReportClient } from '@/components/reports/daily-report-client'
import { Metadata } from 'next'
import type { DailyEntryCategory } from '@/types'

export const metadata: Metadata = {
  title: 'Daily Report (Idle Needle) | GMS ERP',
}

export default async function IdleNeedleDailyReportPage() {
  const user = await requireActiveAccount()
  if (!user.isSiteAdmin) {
    await requirePermission(user.profile.id, 'idle.daily_report.view')
  }

  const contextRes = await getAuthorizedDailyReportContextAction()
  const floors = contextRes.success && contextRes.data ? contextRes.data.floors : []
  const allowedCategories: DailyEntryCategory[] =
    contextRes.success && contextRes.data ? contextRes.data.allowedCategories : ['IDLE']

  return (
    <DailyReportClient
      defaultCategory="IDLE"
      initialFloors={floors}
      allowedCategories={allowedCategories}
      userPermissions={user.permissions || []}
      isSiteAdmin={user.isSiteAdmin}
    />
  )
}
