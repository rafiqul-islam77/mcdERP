'use server'

import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { getDashboardData } from '@/lib/dashboard/dashboard-data-service'
import type { ActionResult } from '@/types'
import type { DashboardData, DashboardFilters } from '@/lib/dashboard/dashboard-types'

/**
 * Server action to load the complete aggregated dashboard dataset.
 *
 * Enforces:
 * 1. Active user account requirement
 * 2. 'dashboard.view' permission check
 * 3. Scope constraints based on authorized floors and categories
 */
export async function getDashboardDataAction(
  filters: DashboardFilters
): Promise<ActionResult<DashboardData>> {
  try {
    const actor = await requireActiveAccount()
    await requirePermission(actor.profile.id, 'dashboard.view')

    // Retrieve authoritative context for current user
    const contextRes = await getAuthorizedContextAction()
    if (!contextRes.success || !contextRes.data) {
      return {
        success: false,
        error: contextRes.error || 'Failed to determine authorized floors.',
      }
    }

    const { floors: authorizedFloors, allowedCategories } = contextRes.data

    const data = await getDashboardData(
      filters,
      actor,
      authorizedFloors,
      allowedCategories
    )

    return {
      success: true,
      data,
    }
  } catch (err: any) {
    console.error('[getDashboardDataAction] error:', err)
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while loading dashboard data.',
    }
  }
}
