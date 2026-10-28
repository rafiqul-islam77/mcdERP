import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getSystemSettingsAction } from '@/app/actions/system-settings'
import { SystemSettingsClient } from '@/components/admin/system-settings-client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'System Settings | Administration | GMS ERP',
}

export default async function SystemSettingsPage() {
  const user = await requireActiveAccount()
  if (!user.isSiteAdmin) {
    await requirePermission(user.profile.id, 'admin.settings.view')
  }

  const canEdit = user.isSiteAdmin || (await hasPermission(user.profile.id, 'admin.settings.edit'))
  const res = await getSystemSettingsAction()
  const initialSettings = res.success && res.data ? res.data : []

  return <SystemSettingsClient initialSettings={initialSettings} canEdit={canEdit} />
}
