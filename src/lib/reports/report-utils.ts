/**
 * Pure utility functions for reports (safe for both Client and Server Components)
 */

/**
 * Normalized floor display rule: Floor Name + Floor Location
 * Example: "A Floor (Building 02)"
 * Strips any trailing _NEW, _RUNNING, _IDLE, _N, _R
 */
export function formatFloorDisplayName(floorName: string, locationName?: string | null): string {
  const cleanName = (floorName || '')
    .replace(/(_NEW|_RUNNING|_IDLE|_N|_R)$/i, '')
    .trim()

  if (!locationName) return cleanName

  // If cleanName already includes (locationName) or locationName itself, return cleanName
  if (cleanName.toLowerCase().includes(locationName.toLowerCase())) {
    return cleanName
  }

  return `${cleanName} (${locationName})`
}
