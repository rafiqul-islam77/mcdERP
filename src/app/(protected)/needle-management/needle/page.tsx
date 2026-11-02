import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { NeedleTable } from '@/components/needle/needle-table'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Needle Master | GMS ERP',
  description: 'Manage master sewing needle inventory specifications and floor assignments.',
}

export default async function NeedlePage() {
  const actor = await requireActiveAccount()

  const canView =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.needle.view'))

  if (!canView) {
    redirect('/unauthorized')
  }

  const canCreate =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.needle.create'))

  const canEdit =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.needle.edit'))

  const canDelete =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'needle_management.needle.delete'))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-full">
      <NeedleTable
        needleGroup="needle"
        pageTitle="Needle Master"
        pageDescription="Manage garment sewing needle specifications, unit prices (BDT/USD), and floor allocations."
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  )
}
