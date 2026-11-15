import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { DashboardClient } from '@/components/dashboard/dashboard-client'

export const metadata = {
  title: 'Dashboard | GMS MCD ERP',
  description: 'Enterprise needle management and inventory analytics dashboard',
}

export default async function DashboardPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'dashboard.view')

  const contextRes = await getAuthorizedContextAction()
  const initialFloors =
    contextRes.success && contextRes.data ? contextRes.data.floors : []
  const allowedCategories =
    contextRes.success && contextRes.data ? contextRes.data.allowedCategories : []

  // Default to current business date
  const today = new Date().toISOString().slice(0, 10)

  return (
    <DashboardClient
      initialFloors={initialFloors}
      allowedCategories={allowedCategories}
      initialDate={today}
    />
  )
}
