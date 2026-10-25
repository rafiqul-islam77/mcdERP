import { redirect } from 'next/navigation'

export default function IdleNeedleDailyEntryRedirect() {
  redirect('/needle/daily-entry?category=IDLE')
}
