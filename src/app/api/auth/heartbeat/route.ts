import { NextResponse } from 'next/server'
import { getCurrentUser, updateLastSeen } from '@/lib/auth'

export async function POST() {
  try {
    const user = await getCurrentUser()
    if (user) {
      await updateLastSeen(user.id)
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
