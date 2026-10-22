'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Edit2,
  KeyRound,
  UserX,
  UserCheck,
  Building,
  Briefcase,
  Shield,
  Clock,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  OnlineStatusBadge,
  AccountStateBadge,
  PasswordStatusBadge,
} from '@/components/ui/status-badge'
import { TokenReveal } from '@/components/admin/token-reveal'
import { ResetCredentialsModal } from '@/components/admin/reset-credentials-modal'
import { updateEmployeeAction, toggleEmployeeDisabledAction } from '@/app/actions/employees'
import { usePresence } from '@/components/presence/presence-provider'
import { useToast } from '@/components/ui/toast'
import type { Floor, Designation, Role, ProfileWithRelations, EmployeeRow } from '@/types'

export function EmployeeDetailClient({
  employee,
  floors,
  designations,
  roles,
  initialEditMode,
  canEdit,
  canDisable,
  canResetCredentials,
  canViewToken,
}: {
  employee: ProfileWithRelations
  floors: Floor[]
  designations: Designation[]
  roles: Role[]
  initialEditMode: boolean
  canEdit: boolean
  canDisable: boolean
  canResetCredentials: boolean
  canViewToken: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { isUserOnline } = usePresence()
  const isOnline = isUserOnline(employee.id)

  const [isEditing, setIsEditing] = React.useState(initialEditMode)
  const [loading, setLoading] = React.useState(false)
  const [resetModalOpen, setResetModalOpen] = React.useState(false)

  // Form states
  const [name, setName] = React.useState(employee.name)
  const [email, setEmail] = React.useState(employee.email)
  const [designationId, setDesignationId] = React.useState(employee.designation_id || '')
  const [roleId, setRoleId] = React.useState(employee.role_id || '')
  
  const initialFloorIds = (employee.floor_ids && employee.floor_ids.length > 0)
    ? employee.floor_ids
    : (employee.floor_id ? [employee.floor_id] : [])
  const [selectedFloorIds, setSelectedFloorIds] = React.useState<string[]>(initialFloorIds)

  const allFloorsSelected = floors.length > 0 && selectedFloorIds.length === floors.length

  const handleFloorToggle = (id: string) => {
    setSelectedFloorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleToggleAllFloors = () => {
    if (allFloorsSelected) {
      setSelectedFloorIds([])
    } else {
      setSelectedFloorIds(floors.map((f) => f.id))
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedFloorIds.length === 0) {
      toast('Please select at least one floor.', 'error')
      return
    }

    setLoading(true)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('email', email)
    formData.append('designation_id', designationId)
    formData.append('role_id', roleId)
    formData.delete('floor_ids')
    selectedFloorIds.forEach((id) => formData.append('floor_ids', id))
    if (selectedFloorIds.length > 0) {
      formData.set('floor_id', selectedFloorIds[0])
    }

    const res = await updateEmployeeAction(employee.id, formData)
    setLoading(false)

    if (res.success) {
      toast('Employee profile updated.', 'success')
      setIsEditing(false)
      router.refresh()
    } else {
      toast(res.error || 'Failed to update employee.', 'error')
    }
  }

  const handleToggleDisabled = async () => {
    const isCurrentlyDisabled = employee.account_state === 'disabled'
    const confirmMsg = isCurrentlyDisabled
      ? `Re-enable ${employee.name}'s account?`
      : `Disable ${employee.name}'s account? They will be unable to sign in.`

    if (!confirm(confirmMsg)) return

    const res = await toggleEmployeeDisabledAction(employee.id, !isCurrentlyDisabled)
    if (res.success) {
      toast(isCurrentlyDisabled ? 'Account enabled.' : 'Account disabled.', 'success')
      router.refresh()
    } else {
      toast(res.error || 'Failed to update account state.', 'error')
    }
  }

  // Adapter for ResetCredentialsModal
  const employeeRow: EmployeeRow = {
    id: employee.id,
    employee_id: employee.employee_id,
    name: employee.name,
    email: employee.email,
    designation: employee.designations?.name || null,
    role: employee.roles?.name || null,
    floor: employee.floors?.name || null,
    account_state: employee.account_state,
    must_set_password: employee.must_set_password,
    last_login_at: employee.last_login_at,
    last_seen_at: employee.last_seen_at,
    has_active_token: true,
    role_is_system: Boolean(employee.roles?.is_system),
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <Link
            href="/administration/employees"
            className="p-1.5 rounded-erp text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{employee.name}</h1>
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-surface-muted text-ink border border-surface-border">
                {employee.employee_id}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Employee Profile & Access Configuration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-1.5">
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Details</span>
            </Button>
          )}

          {canResetCredentials && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetModalOpen(true)}
              className="gap-1.5 text-warning-dark hover:bg-warning/10"
            >
              <KeyRound className="w-3.5 h-3.5 text-warning" />
              <span>Reset Credentials</span>
            </Button>
          )}

          {canDisable && (
            <Button
              variant={employee.account_state === 'disabled' ? 'success' : 'danger'}
              size="sm"
              onClick={handleToggleDisabled}
              className="gap-1.5"
            >
              {employee.account_state === 'disabled' ? (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Enable</span>
                </>
              ) : (
                <>
                  <UserX className="w-3.5 h-3.5" />
                  <span>Disable</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-white p-4 rounded-erp-lg border border-surface-border shadow-xs grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-ink-muted block text-[10px] uppercase font-bold tracking-wider mb-1">
            Presence Status
          </span>
          <OnlineStatusBadge status={isOnline ? 'live' : 'offline'} lastSeen={employee.last_seen_at} />
        </div>

        <div>
          <span className="text-ink-muted block text-[10px] uppercase font-bold tracking-wider mb-1">
            Account State
          </span>
          <AccountStateBadge state={employee.account_state} />
        </div>

        <div>
          <span className="text-ink-muted block text-[10px] uppercase font-bold tracking-wider mb-1">
            Password State
          </span>
          <PasswordStatusBadge
            status={
              employee.account_state === 'pending_activation'
                ? 'not_set'
                : employee.account_state === 'credential_reset_required' || employee.must_set_password
                ? 'reset_required'
                : 'active'
            }
          />
        </div>

        <div>
          <span className="text-ink-muted block text-[10px] uppercase font-bold tracking-wider mb-1">
            One-Time Token
          </span>
          <TokenReveal userId={employee.id} hasActiveToken={true} canViewToken={canViewToken} />
        </div>
      </div>

      {/* Main Content: View vs Edit */}
      {isEditing ? (
        <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Employee ID (Read-only)"
                  value={employee.employee_id}
                  disabled
                  className="bg-surface-muted font-mono"
                />
              </div>

              <div>
                <Input
                  label="Full Name *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Input
                label="Official Email Address *"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <Select
                  label="Designation *"
                  value={designationId}
                  onChange={(e) => setDesignationId(e.target.value)}
                  required
                >
                  <option value="">Select Designation...</option>
                  {designations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Select
                  label="Role *"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  required
                >
                  <option value="">Select Role...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.is_system ? '(System)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Floor Selection Checkbox Area (§8) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
                  Assigned Floors <span className="text-danger">*</span>
                  <span className="ml-2 font-normal text-ink-muted lowercase">
                    ({selectedFloorIds.length} of {floors.length} selected)
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleToggleAllFloors}
                  className="text-xs font-medium text-brand hover:underline cursor-pointer"
                >
                  {allFloorsSelected ? 'Clear All' : 'Select All Floors'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-erp border border-surface-border bg-slate-50/50">
                {floors.map((f) => {
                  const isChecked = selectedFloorIds.includes(f.id)
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-2.5 p-2 rounded-erp border transition-all cursor-pointer text-xs font-medium select-none ${
                        isChecked
                          ? 'bg-brand/5 border-brand/40 text-brand font-semibold shadow-xs'
                          : 'bg-white border-surface-border text-ink hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={f.id}
                        checked={isChecked}
                        onChange={() => handleFloorToggle(f.id)}
                        className="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="truncate">{f.code ? `${f.code} - ${f.name}` : f.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-surface-border flex justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={loading}
                loadingText="Saving Changes..."
                className="gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-4">
              <div>
                <span className="text-ink-muted uppercase font-bold tracking-wider block text-[10px]">
                  Full Name
                </span>
                <span className="text-ink font-semibold text-sm mt-0.5 block">{employee.name}</span>
              </div>

              <div>
                <span className="text-ink-muted uppercase font-bold tracking-wider block text-[10px]">
                  Official Email
                </span>
                <span className="text-ink font-medium mt-0.5 block">{employee.email}</span>
              </div>

              <div>
                <span className="text-ink-muted uppercase font-bold tracking-wider block text-[10px]">
                  Designation
                </span>
                <span className="text-ink font-semibold mt-0.5 inline-flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-ink-light" />
                  {employee.designations?.name || '—'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-ink-muted uppercase font-bold tracking-wider block text-[10px]">
                  Assigned Floors
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(() => {
                    const ids = employee.floor_ids && employee.floor_ids.length > 0
                      ? employee.floor_ids
                      : (employee.floor_id ? [employee.floor_id] : [])

                    if (ids.length === 0) {
                      return (
                        <span className="text-ink font-semibold inline-flex items-center gap-1.5 text-xs">
                          <Building className="w-3.5 h-3.5 text-ink-light" />
                          {employee.floors?.name || '—'}
                        </span>
                      )
                    }

                    if (ids.length >= floors.length && floors.length > 1) {
                      return (
                        <span className="inline-flex items-center gap-1 font-semibold text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded text-xs">
                          <Building className="w-3.5 h-3.5 shrink-0" />
                          All Floors
                        </span>
                      )
                    }

                    return ids.map((id) => {
                      const f = floors.find((fl) => fl.id === id)
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 font-bold text-ink bg-surface-muted border border-surface-border px-2 py-0.5 rounded text-xs"
                          title={f?.name || employee.floors?.name || ''}
                        >
                          <Building className="w-3 h-3 text-ink-light shrink-0" />
                          {f?.code || f?.name || employee.floors?.code || employee.floors?.name || id}
                        </span>
                      )
                    })
                  })()}
                </div>
              </div>

              <div>
                <span className="text-ink-muted uppercase font-bold tracking-wider block text-[10px]">
                  System Role
                </span>
                <span className="text-ink font-semibold mt-0.5 inline-flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-ink-light" />
                  {employee.roles?.name || '—'}
                  {employee.roles?.is_system && (
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-200">
                      System
                    </span>
                  )}
                </span>
              </div>

              <div>
                <span className="text-ink-muted uppercase font-bold tracking-wider block text-[10px]">
                  Last Sign In
                </span>
                <span className="text-ink-muted mt-0.5 inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ink-light" />
                  {employee.last_login_at
                    ? new Date(employee.last_login_at).toLocaleString()
                    : 'Never logged in'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Modal */}
      <ResetCredentialsModal
        isOpen={resetModalOpen}
        employee={employeeRow}
        onClose={() => setResetModalOpen(false)}
      />
    </div>
  )
}
