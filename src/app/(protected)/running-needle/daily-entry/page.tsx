import { redirect } from 'next/navigation'

export default function RunningNeedleDailyEntryRedirect() {
  redirect('/needle/daily-entry?category=RUNNING')
}
