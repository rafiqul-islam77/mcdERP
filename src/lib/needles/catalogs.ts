import type { NeedleGroup } from '@/types'

// Each page has independent master rows, foreign keys, and floor assignments.
export function getNeedleCatalog(group: NeedleGroup) {
  if (group === 'needle') {
    return {
      items: 'normal_needle_items',
      assignments: 'normal_needle_floor_assignments',
      setFloorsRpc: 'set_normal_needle_floors',
      prefix: 'SN',
      label: 'Normal Needle',
    } as const
  }
  if (group === 'ideal_needle') {
    return {
      items: 'idle_needle_items',
      assignments: 'idle_needle_floor_assignments',
      setFloorsRpc: 'set_idle_needle_floors',
      prefix: 'IN',
      label: 'Ideal Needle',
    } as const
  }
  throw new Error('Invalid needle catalog.')
}
