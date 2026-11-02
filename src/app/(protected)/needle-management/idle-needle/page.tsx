import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { NeedleTable } from '@/components/needle/needle-table'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Idle Needle Master | GMS ERP',
  description: 'Manage idle sewing needle specifications, benchmarks, and floor allocations.',
}

export default async function IdleNeedlePage() {
  const actor = await requireActiveAccount()

  const canView =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.view'))

  if (!canView) {
    redirect('/unauthorized')
  }

  const canCreate =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.create'))

  const canEdit =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.edit'))

  const canDelete =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.ideal_needle.delete'))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full">
      <NeedleTable
        needleGroup="ideal_needle"
        pageTitle="Idle Needle Master"
        pageDescription="Standard idle needle benchmarks, size/type references, and floor allocations."
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  )
}
