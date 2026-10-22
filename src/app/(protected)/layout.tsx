import * as React from 'react'
import { requireActiveAccount } from '@/lib/auth'
import { AppShell } from '@/components/layout/app-shell'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireActiveAccount()

  return <AppShell user={user}>{children}</AppShell>
}
