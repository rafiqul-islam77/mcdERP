import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { NeedleTable } from '@/components/needle/needle-table'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Ideal Needle Master | GMS ERP',
  description: 'Manage ideal sewing needle specifications, benchmarks, and floor allocations.',
}

export default async function IdealNeedlePage() {
  const actor = await requireActiveAccount()

  const canView =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.view')) ||
    (await hasPermission(actor.profile.id, 'idle.daily_entry.view')) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.view')) ||
    (await hasPermission(actor.profile.id, 'admin.floors.view'))

  if (!canView) {
    redirect('/unauthorized')
  }

  const canCreate =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.create')) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.create'))

  const canEdit =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.edit')) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.edit'))

  const canDelete =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.delete')) ||
    (await hasPermission(actor.profile.id, 'needle.daily_entry.delete'))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full">
      <NeedleTable
        needleGroup="ideal_needle"
        pageTitle="Ideal Needle Master"
        pageDescription="Standard ideal needle benchmarks, size/type references, and floor allocations."
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  )
}
