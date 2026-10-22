import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { FloorManager } from '@/components/admin/floor-form'
import type { Floor, FloorLocation } from '@/types'

export const dynamic = 'force-dynamic'

export default async function LocationFloorsPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.floors.view')

  const admin = getAdminClient()

  // 1. Fetch active floor locations for dropdown
  let floorLocations: FloorLocation[] = []
  try {
    const { data: locs, error: locError } = await admin
      .from('floor_locations')
      .select('*')
      .order('sort_order', { ascending: true })

    if (!locError && locs) {
      floorLocations = locs as FloorLocation[]
    }
  } catch {
    floorLocations = []
  }

  // 2. Fetch floors joined with floor locations (with graceful fallback if column is being migrated)
  let floors: Floor[] = []
  try {
    const { data: floorsWithLoc, error: floorError } = await admin
      .from('floors')
      .select('*, floor_locations:floor_location_id(id, name, code)')
      .order('sort_order', { ascending: true })

    if (!floorError && floorsWithLoc) {
      floors = floorsWithLoc as unknown as Floor[]
    } else {
      // Fallback without join
      const { data: fallbackFloors } = await admin
        .from('floors')
        .select('*')
        .order('sort_order', { ascending: true })
      floors = (fallbackFloors as Floor[]) || []
    }
  } catch {
    const { data: fallbackFloors } = await admin
      .from('floors')
      .select('*')
      .order('sort_order', { ascending: true })
    floors = (fallbackFloors as Floor[]) || []
  }

  const [canCreate, canEdit] = await Promise.all([
    hasPermission(user.profile.id, 'admin.floors.create'),
    hasPermission(user.profile.id, 'admin.floors.edit'),
  ])

  return (
    <FloorManager
      floors={floors}
      floorLocations={floorLocations}
      canCreate={canCreate}
      canEdit={canEdit}
    />
  )
}
