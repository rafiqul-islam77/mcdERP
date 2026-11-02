import { DailyEntryShell } from '@/components/needle/daily-entry/daily-entry-shell'
import { requireActiveAccount } from '@/lib/auth'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { redirect } from 'next/navigation'
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

  const contextRes = await getAuthorizedContextAction()
  if (!contextRes.success || !contextRes.data) {
    redirect('/unauthorized')
  }

  const { allowedCategories, floors } = contextRes.data
  if (allowedCategories.length === 0) {
    redirect('/unauthorized')
  }

  // Validate requested category against user's permitted categories
  let selectedCategory: DailyEntryCategory = allowedCategories[0]
  if (rawCat && (rawCat === 'RUNNING' || rawCat === 'NEW' || rawCat === 'IDLE')) {
    if (allowedCategories.includes(rawCat as DailyEntryCategory)) {
      selectedCategory = rawCat as DailyEntryCategory
    }
  } else if (allowedCategories.includes('RUNNING')) {
    selectedCategory = 'RUNNING'
  }

  return (
    <DailyEntryShell
      defaultCategory={selectedCategory}
      initialAllowedCategories={allowedCategories}
      initialFloors={floors}
      user={user}
    />
  )
}
