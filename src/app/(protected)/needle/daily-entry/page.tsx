import { DailyEntryShell } from '@/components/needle/daily-entry/daily-entry-shell'
import { requireActiveAccount } from '@/lib/auth'
import { Metadata } from 'next'
import type { DailyEntryCategory } from '@/types'

export const metadata: Metadata = {
  title: 'Daily Entry | GMS ERP',
  description: 'Daily needle receipts, issues, broken records, and floor balances.',
}

interface PageProps {
  searchParams?: Promise<{ category?: string }>
}

export default async function NeedleDailyEntryPage({ searchParams }: PageProps) {
  const user = await requireActiveAccount()
  const resolvedParams = searchParams ? await searchParams : undefined
  const rawCat = resolvedParams?.category?.toUpperCase()

  let defaultCategory: DailyEntryCategory = 'RUNNING'
  if (rawCat === 'NEW') {
    defaultCategory = 'NEW'
  } else if (rawCat === 'IDLE') {
    defaultCategory = 'IDLE'
  }

  return <DailyEntryShell defaultCategory={defaultCategory} user={user} />
}
