import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { FloorLocationManager } from '@/components/admin/floor-location-form'
import type { FloorLocation } from '@/types'

export const dynamic = 'force-dynamic'

export default async function FloorLocationsPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.floor_locations.view')

  const admin = getAdminClient()

  let floorLocations: FloorLocation[] = []
  try {
    const { data, error } = await admin
      .from('floor_locations')
      .select('*')
      .order('sort_order', { ascending: true })

    if (!error && data) {
      floorLocations = data as FloorLocation[]
    }
  } catch {
    floorLocations = []
  }

  const [canCreate, canEdit] = await Promise.all([
    hasPermission(user.profile.id, 'admin.floor_locations.create'),
    hasPermission(user.profile.id, 'admin.floor_locations.edit'),
  ])

  return (
    <FloorLocationManager
      floorLocations={floorLocations}
      canCreate={canCreate}
      canEdit={canEdit}
    />
  )
}
