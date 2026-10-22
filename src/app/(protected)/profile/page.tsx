import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { ProfileClient } from './_components/profile-client'

export default async function ProfilePage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'profile.view')

  return <ProfileClient user={user} />
}
