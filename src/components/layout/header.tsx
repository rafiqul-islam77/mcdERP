'use client'

import * as React from 'react'
import { Menu, Shield } from 'lucide-react'
import type { CurrentUser } from '@/types'
import { OnlineStatusBadge } from '@/components/ui/status-badge'
import { usePresence } from '@/components/presence/presence-provider'

export function Header({
  user,
  onMenuToggle,
}: {
  user: CurrentUser
  onMenuToggle: () => void
}) {
  const { isUserOnline } = usePresence()
  const isOnline = isUserOnline(user.id)

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-surface-border px-4 lg:px-8 flex items-center justify-between shadow-xs">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="lg:hidden p-2 text-ink-muted hover:text-ink hover:bg-surface-muted rounded-erp transition-colors"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* System Location / Badge */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-ink-muted font-medium">
          <span className="font-semibold text-ink">GMS Composite Knitting Ind. Ltd.</span>
          <span>•</span>
          <span>MCD Warehouse</span>
          {(() => {
            const floorsList =
              user.profile.assigned_floors && user.profile.assigned_floors.length > 0
                ? user.profile.assigned_floors
                : (user.profile.floors ? [user.profile.floors] : [])

            if (floorsList.length === 0) return null

            return (
              <>
                <span>•</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {floorsList.map((f) => {
                    const code = f.code || f.name
                    return (
                      <span
                        key={f.id}
                        className="bg-brand/10 text-brand border border-brand/20 px-2 py-0.5 rounded-full font-bold text-[11px] tracking-wide"
                        title={f.name}
                      >
                        {code}
                      </span>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* Right User Bar */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Presence Indicator */}
        <OnlineStatusBadge status={isOnline ? 'live' : 'live'} />

        {/* User Card */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-surface-border">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-surface-border flex items-center justify-center text-ink font-semibold text-xs">
            {user.profile.name.charAt(0).toUpperCase()}
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-semibold text-ink leading-tight flex items-center gap-1.5">
              {user.profile.name}
              {user.isSiteAdmin && (
                <span title="Site Administrator">
                  <Shield className="w-3 h-3 text-brand" />
                </span>
              )}
            </span>
            <span className="text-[10px] text-ink-muted">
              {user.profile.employee_id}
              {user.isSiteAdmin && user.profile.roles?.name ? ` • ${user.profile.roles.name}` : ''}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
