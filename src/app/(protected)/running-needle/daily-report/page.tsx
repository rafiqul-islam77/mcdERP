import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { DailyReportClient } from '@/components/reports/daily-report-client'
import { Metadata } from 'next'
import type { DailyEntryCategory } from '@/types'

export const metadata: Metadata = {
  title: 'Daily Report (Running Needle) | GMS ERP',
}

export default async function RunningNeedleDailyReportPage() {
  const user = await requireActiveAccount()
  if (!user.isSiteAdmin) {
    await requirePermission(user.profile.id, 'needle.daily_report.view')
  }

  const contextRes = await getAuthorizedContextAction()
  const floors = contextRes.success && contextRes.data ? contextRes.data.floors : []
  const allowedCategories: DailyEntryCategory[] =
    contextRes.success && contextRes.data ? contextRes.data.allowedCategories : ['RUNNING']

  return (
    <DailyReportClient
      defaultCategory="RUNNING"
      initialFloors={floors}
      allowedCategories={allowedCategories}
      userPermissions={user.permissions || []}
      isSiteAdmin={user.isSiteAdmin}
    />
  )
}
