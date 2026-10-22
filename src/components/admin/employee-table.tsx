'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Search,
  Plus,
  SlidersHorizontal,
  Edit,
  UserX,
  UserCheck,
  KeyRound,
  Eye,
} from 'lucide-react'
import {
  OnlineStatusBadge,
  AccountStateBadge,
  PasswordStatusBadge,
} from '@/components/ui/status-badge'
import { TokenReveal } from './token-reveal'
import { ResetCredentialsModal } from './reset-credentials-modal'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import {
  toggleEmployeeDisabledAction,
  updateEmployeeFloorsAction,
} from '@/app/actions/employees'
import { usePresence } from '@/components/presence/presence-provider'
import { useToast } from '@/components/ui/toast'
import type { EmployeeRow, Floor, Designation, Role } from '@/types'

function getFloorCode(floor: Floor): string {
  if (floor.code && floor.code.trim()) {
    return floor.code.trim()
  }
  return floor.name.trim()
}

function formatFloorDisplay(floorIds: string[], allFloors: Floor[]): string | null {
  if (floorIds.length === 0) return null
  const activeFloors = allFloors.filter((f) => f.active !== false)
  if (floorIds.length >= activeFloors.length && activeFloors.length > 1) {
    return 'All Floors'
  }
  const codes = floorIds
    .map((id) => {
      const f = allFloors.find((fl) => fl.id === id)
      return f ? (f.code || f.name) : null
    })
    .filter(Boolean) as string[]
  return codes.length > 0 ? codes.join(', ') : null
}

export function EmployeeTable({
  initialEmployees,
  floors,
  designations,
  roles,
  canCreate,
  canEdit,
  canDisable,
  canResetCredentials,
  canViewToken,
}: {
  initialEmployees: EmployeeRow[]
  floors: Floor[]
  designations: Designation[]
  roles: Role[]
  canCreate: boolean
  canEdit: boolean
  canDisable: boolean
  canResetCredentials: boolean
  canViewToken: boolean
}) {
  const { toast } = useToast()
  const { isUserOnline } = usePresence()

  // State
  const [employeesList, setEmployeesList] = React.useState<EmployeeRow[]>(initialEmployees)
  React.useEffect(() => {
    setEmployeesList(initialEmployees)
  }, [initialEmployees])

  const activeFloors = React.useMemo(
    () => floors.filter((f) => f.active !== false),
    [floors]
  )

  const [search, setSearch] = React.useState('')
  const [selectedFloor, setSelectedFloor] = React.useState('ALL')
  const [selectedDesignation, setSelectedDesignation] = React.useState('ALL')
  const [selectedRole, setSelectedRole] = React.useState('ALL')
  const [selectedAccountState, setSelectedAccountState] = React.useState('ALL')
  const [selectedStatus, setSelectedStatus] = React.useState('ALL')

  const [currentPage, setCurrentPage] = React.useState(1)
  const pageSize = 15

  // Reset Credentials Modal State
  const [resetModalEmployee, setResetModalEmployee] = React.useState<EmployeeRow | null>(null)
  const [actionMenuOpenId, setActionMenuOpenId] = React.useState<string | null>(null)

  // Handle inline automatic floor toggle
  const handleToggleFloor = async (empId: string, floorId: string) => {
    if (!canEdit) return

    const targetEmp = employeesList.find((e) => e.id === empId)
    if (!targetEmp) return

    const currentFloorIds = targetEmp.floor_ids || []
    const isCurrentlyChecked = currentFloorIds.includes(floorId)
    const newFloorIds = isCurrentlyChecked
      ? currentFloorIds.filter((id) => id !== floorId)
      : [...currentFloorIds, floorId]

    // Optimistically update UI
    setEmployeesList((prev) =>
      prev.map((e) =>
        e.id === empId
          ? {
              ...e,
              floor_ids: newFloorIds,
              floor: formatFloorDisplay(newFloorIds, floors),
            }
          : e
      )
    )

    const res = await updateEmployeeFloorsAction(empId, newFloorIds)
    if (!res.success) {
      // Revert if error
      setEmployeesList((prev) =>
        prev.map((e) => (e.id === empId ? targetEmp : e))
      )
      toast(res.error || 'Failed to update floor assignment.', 'error')
    } else {
      toast('Floor updated.', 'success')
    }
  }

  // Filter employees
  const filtered = employeesList.filter((emp) => {
    // 1. Search (ID, name, email)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      const matchesId = emp.employee_id.toLowerCase().includes(q)
      const matchesName = emp.name.toLowerCase().includes(q)
      const matchesEmail = emp.email.toLowerCase().includes(q)
      if (!matchesId && !matchesName && !matchesEmail) return false
    }

    // 2. Floor filter (supports single or multi-floor employees)
    if (selectedFloor !== 'ALL') {
      if (emp.floor_ids && emp.floor_ids.length > 0) {
        const matchingFloor = floors.find((f) => f.name === selectedFloor)
        if (!matchingFloor || !emp.floor_ids.includes(matchingFloor.id)) {
          // If employee is assigned to 'All Floors', they match any floor filter
          const isAllFloors = emp.floor === 'All Floors'
          if (!isAllFloors) return false
        }
      } else if (emp.floor !== selectedFloor && emp.floor !== 'All Floors') {
        return false
      }
    }

    // 3. Designation filter
    if (selectedDesignation !== 'ALL' && emp.designation !== selectedDesignation) {
      return false
    }

    // 4. Role filter
    if (selectedRole !== 'ALL' && emp.role !== selectedRole) {
      return false
    }

    // 5. Account state filter
    if (selectedAccountState !== 'ALL' && emp.account_state !== selectedAccountState) {
      return false
    }

    // 6. Online Status filter (Live vs Offline)
    if (selectedStatus !== 'ALL') {
      const isOnline = isUserOnline(emp.id)
      if (selectedStatus === 'LIVE' && !isOnline) return false
      if (selectedStatus === 'OFFLINE' && isOnline) return false
    }

    return true
  })

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Toggle enable/disable
  const handleToggleDisable = async (employee: EmployeeRow) => {
    setActionMenuOpenId(null)
    const isCurrentlyDisabled = employee.account_state === 'disabled'
    const confirmMessage = isCurrentlyDisabled
      ? `Re-enable account for ${employee.employee_id} — ${employee.name}?`
      : `Disable account for ${employee.employee_id} — ${employee.name}? They will be blocked from logging in.`

    if (!confirm(confirmMessage)) return

    const res = await toggleEmployeeDisabledAction(employee.id, !isCurrentlyDisabled)
    if (res.success) {
      toast(isCurrentlyDisabled ? 'Employee re-enabled' : 'Employee account disabled', 'success')
    } else {
      toast(res.error || 'Action failed', 'error')
    }
  }

  // Derive password status based on must_set_password and account_state
  const getPasswordStatus = (emp: EmployeeRow) => {
    if (emp.account_state === 'pending_activation') return 'not_set'
    if (emp.account_state === 'credential_reset_required' || emp.must_set_password) return 'reset_required'
    return 'active'
  }

  return (
    <div className="space-y-4">
      {/* Top Header / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          <h1 className="text-xl font-bold text-ink">Employees & Users</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Manage factory personnel, floor assignments, security credentials, and live statuses.
          </p>
        </div>

        {canCreate && (
          <Link href="/administration/employees/new">
            <Button className="gap-1.5 shadow-sm">
              <Plus className="w-4 h-4" />
              <span>Add Employee</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-erp-lg border border-surface-border shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* Search bar */}
          <div className="relative lg:col-span-2">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-light">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search ID, name, email..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
            />
          </div>

          {/* Floor filter */}
          <div>
            <select
              value={selectedFloor}
              onChange={(e) => {
                setSelectedFloor(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="ALL">All Floors</option>
              {floors.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.code ? `${f.code} - ${f.name}` : f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role filter */}
          <div>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="ALL">All Roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Designation filter */}
          <div>
            <select
              value={selectedDesignation}
              onChange={(e) => {
                setSelectedDesignation(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="ALL">All Designations</option>
              {designations.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status (Live/Offline) filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="ALL">All Status (Live/Offline)</option>
              <option value="LIVE">Live Online</option>
              <option value="OFFLINE">Offline</option>
            </select>
          </div>

          {/* Account State filter */}
          <div>
            <select
              value={selectedAccountState}
              onChange={(e) => {
                setSelectedAccountState(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="ALL">All Account States</option>
              <option value="active">Active</option>
              <option value="pending_activation">Pending Activation</option>
              <option value="credential_reset_required">Reset Required</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-erp overflow-visible">
        <div className="overflow-x-auto min-h-[260px] pb-6">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-12 text-center" title="Actions">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-ink-muted mx-auto" />
                </th>
                <th className="w-24">Employee ID</th>
                <th>Staff Name</th>
                <th>Floor</th>
                <th>Email</th>
                <th>Designation</th>
                <th>Role</th>
                <th className="text-center">Status</th>
                <th className="text-center">Account State</th>
                <th className="text-center">Password</th>
                <th className="text-center">One-Time Token</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-ink-muted">
                    No employees matching the current filters.
                  </td>
                </tr>
              ) : (
                paginated.map((emp, index) => {
                  const isOnline = isUserOnline(emp.id)
                  const isMenuOpen = actionMenuOpenId === emp.id
                  const openUpwards = paginated.length > 1 && index >= paginated.length - 2

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Action Menu Column (First Column) */}
                      <td className={`text-center whitespace-nowrap relative ${isMenuOpen ? 'z-30' : ''}`}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() =>
                              setActionMenuOpenId(isMenuOpen ? null : emp.id)
                            }
                            className={`p-1.5 rounded-erp transition-colors ${
                              isMenuOpen
                                ? 'bg-brand text-white shadow-xs'
                                : 'text-ink-muted hover:text-brand hover:bg-slate-100'
                            }`}
                            title="Actions"
                            aria-label="Actions"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setActionMenuOpenId(null)}
                              />
                              <div
                                className={`absolute left-0 w-44 rounded-erp bg-white shadow-xl border border-surface-border py-1 z-50 divide-y divide-surface-border text-left ${
                                  openUpwards
                                    ? 'bottom-full mb-1.5 origin-bottom-left'
                                    : 'top-full mt-1.5 origin-top-left'
                                }`}
                              >
                                <div className="py-1">
                                  <Link
                                    href={`/administration/employees/${emp.id}`}
                                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-muted transition-colors"
                                    onClick={() => setActionMenuOpenId(null)}
                                  >
                                    <Eye className="w-3.5 h-3.5 text-ink-muted" />
                                    View Details
                                  </Link>

                                  {canEdit && (
                                    <Link
                                      href={`/administration/employees/${emp.id}?edit=true`}
                                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-muted transition-colors"
                                      onClick={() => setActionMenuOpenId(null)}
                                    >
                                      <Edit className="w-3.5 h-3.5 text-ink-muted" />
                                      Edit Employee
                                    </Link>
                                  )}
                                </div>

                                {(canDisable || canResetCredentials) && (
                                  <div className="py-1">
                                    {canResetCredentials && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActionMenuOpenId(null)
                                          setResetModalEmployee(emp)
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50 transition-colors"
                                      >
                                        <KeyRound className="w-3.5 h-3.5 text-warning" />
                                        Reset Credentials
                                      </button>
                                    )}

                                    {canDisable && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleDisable(emp)}
                                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                                          emp.account_state === 'disabled'
                                            ? 'text-success hover:bg-success/10'
                                            : 'text-danger hover:bg-danger/10'
                                        }`}
                                      >
                                        {emp.account_state === 'disabled' ? (
                                          <>
                                            <UserCheck className="w-3.5 h-3.5 text-success" />
                                            Enable Account
                                          </>
                                        ) : (
                                          <>
                                            <UserX className="w-3.5 h-3.5 text-danger" />
                                            Disable Account
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Employee ID */}
                      <td className="font-mono font-bold text-ink whitespace-nowrap">
                        {emp.employee_id}
                      </td>

                      {/* Name */}
                      <td className="font-semibold text-ink whitespace-nowrap">
                        {emp.name}
                      </td>

                      {/* Floor (After Name, Code Checkboxes, 3 per line with wrap, automatic update) */}
                      <td className="py-2">
                        {activeFloors.length === 0 ? (
                          <span className="text-ink-muted">—</span>
                        ) : (
                          <div className="grid grid-cols-3 gap-x-2 gap-y-1 w-max">
                            {activeFloors.map((f) => {
                              const isChecked = (emp.floor_ids || []).includes(f.id)
                              const code = getFloorCode(f)

                              return (
                                <label
                                  key={f.id}
                                  className={`inline-flex items-center gap-1 cursor-pointer select-none px-1.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap transition-all ${
                                    isChecked
                                      ? 'bg-brand/10 text-brand border border-brand/30 shadow-2xs'
                                      : 'text-ink-muted hover:text-ink hover:bg-slate-100 border border-transparent'
                                  } ${!canEdit ? 'opacity-80 cursor-default' : ''}`}
                                  title={`${f.name} (${code}) - Click to toggle`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={!canEdit}
                                    onChange={() => handleToggleFloor(emp.id, f.id)}
                                    className="w-3 h-3 text-brand rounded border-slate-300 focus:ring-0 cursor-pointer disabled:cursor-default"
                                  />
                                  <span className="leading-none">{code}</span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </td>

                      {/* Email */}
                      <td className="text-ink-muted whitespace-nowrap">{emp.email}</td>

                      {/* Designation */}
                      <td className="text-ink whitespace-nowrap">
                        {emp.designation || '—'}
                      </td>

                      {/* Role */}
                      <td className="whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          emp.role_is_system ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {emp.role || '—'}
                        </span>
                      </td>

                      {/* Status (Live / Offline) (§26) */}
                      <td className="text-center whitespace-nowrap">
                        <OnlineStatusBadge
                          status={isOnline ? 'live' : 'offline'}
                          lastSeen={emp.last_seen_at}
                        />
                      </td>

                      {/* Account State (§6) */}
                      <td className="text-center whitespace-nowrap">
                        <AccountStateBadge state={emp.account_state} />
                      </td>

                      {/* Password Status */}
                      <td className="text-center whitespace-nowrap">
                        <PasswordStatusBadge status={getPasswordStatus(emp)} />
                      </td>

                      {/* Token (§19) */}
                      <td className="text-center whitespace-nowrap">
                        <TokenReveal
                          userId={emp.id}
                          hasActiveToken={emp.has_active_token}
                          canViewToken={canViewToken}
                        />
                      </td>

                      {/* Last Login */}
                      <td className="text-ink-muted text-[11px] whitespace-nowrap">
                        {emp.last_login_at
                          ? new Date(emp.last_login_at).toLocaleDateString(undefined, {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Never'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="p-3 border-t border-surface-border">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      {/* Reset Credentials Modal (§24) */}
      <ResetCredentialsModal
        isOpen={Boolean(resetModalEmployee)}
        employee={resetModalEmployee}
        onClose={() => setResetModalEmployee(null)}
      />
    </div>
  )
}
