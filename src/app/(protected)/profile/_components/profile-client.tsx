'use client'

import * as React from 'react'
import { KeyRound, Save, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateProfileAction, changePasswordAction } from '@/app/actions/profile'
import { useToast } from '@/components/ui/toast'
import type { CurrentUser } from '@/types'

export function ProfileClient({ user }: { user: CurrentUser }) {
  const { toast } = useToast()

  const [name, setName] = React.useState(user.profile.name)
  const [profileLoading, setProfileLoading] = React.useState(false)

  // Password change states
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [passwordLoading, setPasswordLoading] = React.useState(false)

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)

    const formData = new FormData()
    formData.append('name', name)

    const res = await updateProfileAction(formData)
    setProfileLoading(false)

    if (res.success) {
      toast('Name updated successfully.', 'success')
    } else {
      toast(res.error || 'Failed to update name.', 'error')
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast('Passwords do not match.', 'error')
      return
    }

    setPasswordLoading(true)
    const formData = new FormData()
    formData.append('password', password)
    formData.append('confirmPassword', confirmPassword)

    const res = await changePasswordAction(formData)
    setPasswordLoading(false)

    if (res.success) {
      toast('Password changed successfully.', 'success')
      setPassword('')
      setConfirmPassword('')
    } else {
      toast(res.error || 'Failed to change password.', 'error')
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="pb-2 border-b border-surface-border">
        <h1 className="text-xl font-bold text-ink">My Profile</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          View your staff profile details and manage your personal access credentials.
        </p>
      </div>

      {/* Main Profile Info Card */}
      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4 pb-6 border-b border-surface-border">
          <div className="w-16 h-16 rounded-full bg-brand/10 border-2 border-brand/20 flex items-center justify-center text-brand font-black text-2xl">
            {user.profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">{user.profile.name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
              <span className="font-mono font-semibold px-2 py-0.5 rounded bg-surface-muted border border-surface-border">
                {user.profile.employee_id}
              </span>
              {user.isSiteAdmin && user.profile.roles?.name && (
                <>
                  <span className="text-ink-muted">•</span>
                  <span className="text-ink font-medium">{user.profile.roles.name}</span>
                </>
              )}
              <span className="text-ink-muted">•</span>
              <span className="text-ink-muted">
                {user.profile.assigned_floors && user.profile.assigned_floors.length > 0
                  ? user.profile.assigned_floors.map((f) => f.code || f.name).join(', ')
                  : (user.profile.floors?.code || user.profile.floors?.name || 'No Floor')}
              </span>
            </div>
          </div>
        </div>

        {/* Editable Name Form */}
        <form onSubmit={handleUpdateName} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Employee ID (Read-only)"
                value={user.profile.employee_id}
                disabled
                className="bg-surface-muted font-mono"
              />
            </div>

            <div>
              <Input
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={`grid grid-cols-1 ${user.isSiteAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
            <div>
              <Input
                label="Designation (Read-only)"
                value={user.profile.designations?.name || '—'}
                disabled
                className="bg-surface-muted"
              />
            </div>

            {user.isSiteAdmin && (
              <div>
                <Input
                  label="Role (Read-only)"
                  value={user.profile.roles?.name || '—'}
                  disabled
                  className="bg-surface-muted"
                />
              </div>
            )}

            <div>
              <Input
                label="Assigned Floors (Read-only)"
                value={
                  user.profile.assigned_floors && user.profile.assigned_floors.length > 0
                    ? user.profile.assigned_floors.map((f) => f.code || f.name).join(', ')
                    : (user.profile.floors?.code || user.profile.floors?.name || '—')
                }
                disabled
                className="bg-surface-muted"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              loading={profileLoading}
              loadingText="Updating Name..."
              className="gap-1.5 shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>Update Name</span>
            </Button>
          </div>
        </form>
      </div>

      {/* Change Password Card */}
      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-brand" />
          <h2 className="text-base font-bold text-ink">Change Account Password</h2>
        </div>
        <p className="text-xs text-ink-muted mb-5">
          Update your login password. Must be at least 8 characters in length.
        </p>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <Input
            label="New Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            hint="Minimum 8 characters"
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
          />

          <Button
            type="submit"
            loading={passwordLoading}
            loadingText="Updating Password..."
            className="gap-1.5"
          >
            <Lock className="w-4 h-4" />
            <span>Update Password</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
