import { redirect } from 'next/navigation'

export default function RegularNeedleDailyEntryPage() {
  redirect('/needle/daily-entry?category=REGULAR')
}
