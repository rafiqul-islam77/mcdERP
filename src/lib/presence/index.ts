import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface PresencePayload {
  userId: string
  employeeId: string
  name: string
  onlineAt: string
}

/**
 * Creates and tracks online presence on the global 'erp-presence' channel.
 */
export function createPresenceChannel(
  user: { id: string; employeeId: string; name: string },
  onPresenceSync?: (activeUserIds: string[]) => void
): { channel: RealtimeChannel; cleanup: () => void } {
  const supabase = createClient()
  const channel = supabase.channel('erp-presence', {
    config: {
      presence: {
        key: user.id,
      },
    },
  })

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const onlineIds = Object.keys(state)
      if (onPresenceSync) {
        onPresenceSync(onlineIds)
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId: user.id,
          employeeId: user.employeeId,
          name: user.name,
          onlineAt: new Date().toISOString(),
        })
      }
    })

  const cleanup = () => {
    channel.untrack().catch(() => {})
    supabase.removeChannel(channel).catch(() => {})
  }

  return { channel, cleanup }
}
