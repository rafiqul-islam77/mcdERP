import { redirect } from 'next/navigation'

export default function BrokenNeedleDailyEntryRedirect() {
  redirect('/needle/daily-entry?category=NEW')
}
