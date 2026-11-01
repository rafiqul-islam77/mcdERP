import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { RegularReportClient } from '@/components/reports/regular-report-client'
import type { DailyEntryCategory, Floor } from '@/types'

export default async function ReportStudioRegularPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'report_studio.regular.view')

  const contextRes = await getAuthorizedContextAction()
  const floors: Floor[] = contextRes.success && contextRes.data ? contextRes.data.floors : []

  // Check category-specific view permissions
  const canRunning =
    user.isSiteAdmin ||
    (await hasPermission(user.profile.id, 'needle.daily_report.view')) ||
    (await hasPermission(user.profile.id, 'daily_report.view'))

  const canNew =
    user.isSiteAdmin ||
    (await hasPermission(user.profile.id, 'broken.daily_report.view')) ||
    (await hasPermission(user.profile.id, 'daily_report.view'))

  const canIdle =
    user.isSiteAdmin ||
    (await hasPermission(user.profile.id, 'idle.daily_report.view')) ||
    (await hasPermission(user.profile.id, 'daily_report.view'))

  const allowedCategories: DailyEntryCategory[] = [
    ...(canRunning ? ['RUNNING' as const] : []),
    ...(canNew ? ['NEW' as const] : []),
    ...(canIdle ? ['IDLE' as const] : []),
  ]

  return (
    <div className="p-6">
      <RegularReportClient
        initialFloors={floors}
        allowedCategories={allowedCategories}
        isSiteAdmin={user.isSiteAdmin}
      />
    </div>
  )
}
