'use client'

import * as React from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import type { CurrentUser } from '@/types'
import { PresenceProvider } from '@/components/presence/presence-provider'
import { ToastProvider } from '@/components/ui/toast'

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  return (
    <ToastProvider>
      <PresenceProvider user={user}>
        <div className="min-h-screen bg-surface flex">
          {/* Dynamic Sidebar */}
          <Sidebar
            user={user}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* Main Content Area */}
          <div className="flex-1 lg:ml-60 flex flex-col min-h-screen min-w-0">
            <Header
              user={user}
              onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
              {children}
            </main>
          </div>
        </div>
      </PresenceProvider>
    </ToastProvider>
  )
}
