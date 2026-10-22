import * as React from 'react'
import type { AccountState, OnlineStatus, PasswordStatus } from '@/types'

export function OnlineStatusBadge({ status, lastSeen }: { status: OnlineStatus; lastSeen?: string | null }) {
  const isLive = status === 'live'

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        isLive ? 'bg-success/15 text-success-dark border border-success/30' : 'bg-surface-muted text-ink-muted border border-surface-border'
      }`}
      title={lastSeen ? `Last seen: ${new Date(lastSeen).toLocaleString()}` : undefined}
    >
      <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-success animate-pulse' : 'bg-ink-light'}`} />
      {isLive ? 'Live' : 'Offline'}
    </span>
  )
}

export function AccountStateBadge({ state }: { state: AccountState }) {
  const map: Record<AccountState, { label: string; style: string }> = {
    active: { label: 'Active', style: 'bg-success/15 text-success-dark border-success/30' },
    pending_activation: { label: 'Pending Activation', style: 'bg-warning/15 text-warning-dark border-warning/30' },
    credential_reset_required: { label: 'Reset Required', style: 'bg-warning/15 text-warning-dark border-warning/30' },
    disabled: { label: 'Disabled', style: 'bg-danger/15 text-danger-dark border-danger/30' },
  }

  const { label, style } = map[state] || { label: state, style: 'bg-surface-muted text-ink-muted border-surface-border' }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      {label}
    </span>
  )
}

export function PasswordStatusBadge({ status }: { status: PasswordStatus }) {
  const map: Record<PasswordStatus, { label: string; style: string }> = {
    active: { label: 'Active', style: 'bg-success/15 text-success-dark border-success/30' },
    not_set: { label: 'Not Set', style: 'bg-surface-muted text-ink-muted border-surface-border' },
    reset_required: { label: 'Reset Required', style: 'bg-warning/15 text-warning-dark border-warning/30' },
  }

  const { label, style } = map[status] || { label: status, style: 'bg-surface-muted text-ink-muted border-surface-border' }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${style}`}>
      {label}
    </span>
  )
}
