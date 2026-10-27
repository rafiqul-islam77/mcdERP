'use client'

import * as React from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { DailyEntryCategory } from '@/types'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface RealtimeTransactionRecord {
  id?: string
  transaction_date?: string
  floor_id?: string
  needle_item_id?: string
  transaction_type?: string
  quantity?: number | string
  req_no?: string | null
  daily_sheet_id?: string | null
  client_operation_id?: string | null
}

export interface RealtimeBnrRecord {
  id?: string
  record_date?: string
  floor_id?: string
  needle_item_id?: string
  category?: string
  quantity?: number | string
}

export interface RealtimeSheetRecord {
  id?: string
  entry_date?: string
  floor_id?: string
  category?: string
  req_no?: string | null
  status?: string
}

export type RealtimeSubscriptionStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CHANNEL_ERROR'
  | 'CLOSED'
  | 'CONNECTING'

export interface UseDailyEntryRealtimeOptions {
  date: string
  floorId: string
  category: DailyEntryCategory
  enabled?: boolean
  onTransactionChange: (payload: RealtimePostgresChangesPayload<RealtimeTransactionRecord>) => void
  onBnrChange: (payload: RealtimePostgresChangesPayload<RealtimeBnrRecord>) => void
  onSheetChange: (payload: RealtimePostgresChangesPayload<RealtimeSheetRecord>) => void
  onReconnect: () => void
}

/**
 * Manages Supabase Realtime subscriptions for the active Daily Entry session.
 *
 * Scope:
 * - Subscribes to the specific category's transaction table (NEW, RUNNING, or IDLE),
 *   plus needle_bnr_records and needle_daily_sheets.
 * - Filters by floor_id at the Postgres Realtime publication level for performance & isolation.
 * - Unsubscribes and creates fresh channels on Date / Floor / Category changes.
 * - Handles reconnection reconciliation when the connection recovers.
 */
export function useDailyEntryRealtime({
  date,
  floorId,
  category,
  enabled = true,
  onTransactionChange,
  onBnrChange,
  onSheetChange,
  onReconnect,
}: UseDailyEntryRealtimeOptions) {
  const [status, setStatus] = React.useState<RealtimeSubscriptionStatus>('CONNECTING')

  // Keep latest callbacks in refs to avoid recreating the channel when callbacks mutate
  const onTransactionChangeRef = React.useRef(onTransactionChange)
  onTransactionChangeRef.current = onTransactionChange

  const onBnrChangeRef = React.useRef(onBnrChange)
  onBnrChangeRef.current = onBnrChange

  const onSheetChangeRef = React.useRef(onSheetChange)
  onSheetChangeRef.current = onSheetChange

  const onReconnectRef = React.useRef(onReconnect)
  onReconnectRef.current = onReconnect

  React.useEffect(() => {
    // Only run on client with valid parameters
    if (!enabled || typeof window === 'undefined' || !floorId || !category || !date) {
      setStatus('CLOSED')
      return
    }

    const supabase = getSupabaseBrowserClient()
    const targetTable =
      category === 'RUNNING'
        ? 'needle_running_transactions'
        : category === 'NEW'
        ? 'needle_new_transactions'
        : 'needle_idle_transactions'

    const channelName = `daily-entry:${floorId}:${category}:${date}`
    let isSubscribed = true
    let wasDisconnected = false

    setStatus('CONNECTING')

    // Create channel
    const channel = supabase.channel(channelName)

    // 1. Transaction changes listener (RECEIVE, ISSUE / DVLD, TRANSFER, ADJUSTMENT)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: targetTable,
        filter: `floor_id=eq.${floorId}`,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeTransactionRecord>) => {
        if (!isSubscribed) return
        onTransactionChangeRef.current(payload)
      }
    )

    // 2. BNR records changes listener
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'needle_bnr_records',
        filter: `floor_id=eq.${floorId}`,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeBnrRecord>) => {
        if (!isSubscribed) return
        onBnrChangeRef.current(payload)
      }
    )

    // 3. Daily sheet header changes listener (req_no, status)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'needle_daily_sheets',
        filter: `floor_id=eq.${floorId}`,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeSheetRecord>) => {
        if (!isSubscribed) return
        onSheetChangeRef.current(payload)
      }
    )

    // Subscribe to channel
    channel.subscribe((subStatus) => {
      if (!isSubscribed) return

      if (subStatus === 'SUBSCRIBED') {
        setStatus('SUBSCRIBED')
        if (wasDisconnected) {
          wasDisconnected = false
          // Connection recovered: perform lightweight reconciliation
          onReconnectRef.current()
        }
      } else if (
        subStatus === 'CHANNEL_ERROR' ||
        subStatus === 'TIMED_OUT' ||
        subStatus === 'CLOSED'
      ) {
        setStatus(subStatus)
        wasDisconnected = true
      }
    })

    // Clean cleanup on unmount or when date, floorId, or category changes
    return () => {
      isSubscribed = false
      channel.unsubscribe().catch(() => {})
      supabase.removeChannel(channel).catch(() => {})
    }
  }, [date, floorId, category, enabled])

  return {
    status,
  }
}
