import { redirect } from 'next/navigation'

export default function NewNeedleDailyEntryRedirect() {
  redirect('/needle/daily-entry?category=NEW')
}
