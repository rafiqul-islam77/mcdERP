'use client'

import * as React from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface UseDashboardRealtimeOptions {
  enabled?: boolean
  onDataChange: () => void
  debounceMs?: number
}

/**
 * Lightweight realtime listener for the GMS MCD ERP Dashboard.
 *
 * Automatically debounces transaction events by 3 seconds so bulk daily entry
 * updates do not flood the server with redundant recalculation requests.
 */
export function useDashboardRealtime({
  enabled = true,
  onDataChange,
  debounceMs = 3000,
}: UseDashboardRealtimeOptions) {
  const onDataChangeRef = React.useRef(onDataChange)
  onDataChangeRef.current = onDataChange

  const timerRef = React.useRef<NodeJS.Timeout | null>(null)

  const triggerDebouncedRefresh = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      onDataChangeRef.current()
    }, debounceMs)
  }, [debounceMs])

  React.useEffect(() => {
    if (!enabled) return

    const supabase = getSupabaseBrowserClient()
    const channelName = `dashboard-realtime-${Date.now()}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'needle_running_transactions' },
        () => {
          triggerDebouncedRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'needle_new_transactions' },
        () => {
          triggerDebouncedRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'needle_idle_transactions' },
        () => {
          triggerDebouncedRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'needle_bnr_records' },
        () => {
          triggerDebouncedRefresh()
        }
      )
      .subscribe()

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      supabase.removeChannel(channel)
    }
  }, [enabled, triggerDebouncedRefresh])
}
