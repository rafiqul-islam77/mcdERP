'use client'

import * as React from 'react'
import { createPresenceChannel } from '@/lib/presence'
import type { CurrentUser } from '@/types'

interface PresenceContextType {
  onlineUserIds: string[]
  isUserOnline: (userId: string) => boolean
}

const PresenceContext = React.createContext<PresenceContextType>({
  onlineUserIds: [],
  isUserOnline: () => false,
})

export function PresenceProvider({
  user,
  children,
}: {
  user: CurrentUser
  children: React.ReactNode
}) {
  const [onlineUserIds, setOnlineUserIds] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!user || !user.id) return

    // Connect to Supabase Realtime Presence
    const { cleanup } = createPresenceChannel(
      {
        id: user.id,
        employeeId: user.profile.employee_id,
        name: user.profile.name,
      },
      (activeIds) => {
        setOnlineUserIds(activeIds)
      }
    )

    // Periodic heartbeat to maintain last_seen_at in DB every 3 minutes
    const interval = setInterval(async () => {
      try {
        await fetch('/api/auth/heartbeat', { method: 'POST' })
      } catch {
        // Heartbeat failure is non-fatal
      }
    }, 3 * 60 * 1000)

    return () => {
      cleanup()
      clearInterval(interval)
    }
  }, [user])

  const isUserOnline = React.useCallback(
    (userId: string) => onlineUserIds.includes(userId),
    [onlineUserIds]
  )

  return (
    <PresenceContext.Provider value={{ onlineUserIds, isUserOnline }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  return React.useContext(PresenceContext)
}
