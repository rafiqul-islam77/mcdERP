'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Save, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateRoleAction, updateRolePermissionsAction } from '@/app/actions/roles'
import { useToast } from '@/components/ui/toast'
import type { Role, Permission } from '@/types'

// Matrix structure configuration matching Specification §14
const MODULE_GROUPS = [
  {
    id: 'dashboard',
    moduleKey: 'dashboard',
    label: 'DASHBOARD',
    pages: [
      { pageKey: 'dashboard', label: 'Main Overview', actions: ['view'] },
    ],
  },
  {
    id: 'needle_management',
    moduleKey: 'needle_management',
    label: 'NEEDLE MANAGEMENT (MASTER DATA)',
    pages: [
      { pageKey: 'needle', label: 'Needle Master', actions: ['view', 'create', 'edit', 'delete'] },
      { pageKey: 'ideal_needle', label: 'Idle Needle Master', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    id: 'needle',
    moduleKey: 'needle',
    label: 'NEEDLE (TRANSACTIONS)',
    pages: [
      { pageKey: 'daily_entry', label: 'Daily Entry', actions: ['view', 'create', 'edit', 'delete', 'export', 'print'] },
      { pageKey: 'daily_report', label: 'Daily Report', actions: ['view', 'export', 'print'] },
      { pageKey: 'monthly_report', label: 'Monthly Report', actions: ['view', 'export', 'print'] },
    ],
  },
  {
    id: 'broken',
    moduleKey: 'broken',
    label: 'BROKEN NEEDLE',
    pages: [
      { pageKey: 'daily_entry', label: 'Broken Daily Entry', actions: ['view', 'create', 'edit', 'delete', 'export', 'print'] },
      { pageKey: 'daily_report', label: 'Broken Daily Report', actions: ['view', 'export', 'print'] },
      { pageKey: 'monthly_report', label: 'Broken Monthly Report', actions: ['view', 'export', 'print'] },
    ],
  },
  {
    id: 'idle',
    moduleKey: 'idle',
    label: 'IDLE NEEDLE',
    pages: [
      { pageKey: 'daily_entry', label: 'Idle Daily Entry', actions: ['view', 'create', 'edit', 'delete', 'export', 'print'] },
      { pageKey: 'daily_report', label: 'Idle Daily Report', actions: ['view', 'export', 'print'] },
      { pageKey: 'monthly_report', label: 'Idle Monthly Report', actions: ['view', 'export', 'print'] },
    ],
  },
  {
    id: 'report_studio',
    moduleKey: 'report_studio',
    label: 'REPORT STUDIO',
    pages: [
      { pageKey: 'regular', label: 'Regular Reports', actions: ['view', 'export'] },
      { pageKey: 'custom', label: 'Custom Reports', actions: ['view', 'create', 'edit', 'delete', 'export'] },
    ],
  },
  {
    id: 'location',
    moduleKey: 'admin',
    label: 'LOCATION MANAGEMENT',
    pages: [
      { pageKey: 'floors', label: 'Floors Master', actions: ['view', 'create', 'edit'] },
      { pageKey: 'floor_locations', label: 'Floor Locations Master', actions: ['view', 'create', 'edit'] },
    ],
  },
  {
    id: 'admin',
    moduleKey: 'admin',
    label: 'ADMINISTRATION',
    pages: [
      { pageKey: 'users', label: 'Employees & Users', actions: ['view', 'create', 'edit', 'disable', 'reset_credentials', 'view_token'] },
      { pageKey: 'roles', label: 'Roles & Permissions', actions: ['view', 'create', 'edit', 'delete'] },
      { pageKey: 'designations', label: 'Designations Master', actions: ['view', 'create', 'edit'] },
      { pageKey: 'audit', label: 'Audit Log Trail', actions: ['view'] },
    ],
  },
  {
    id: 'profile',
    moduleKey: 'profile',
    label: 'USER PROFILE',
    pages: [
      { pageKey: 'profile', label: 'Personal Profile', actions: ['view', 'edit'] },
    ],
  },
]

const STANDARD_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print']

export function RoleEditor({
  role,
  initialPermissionKeys,
  allPermissions,
  canEdit,
}: {
  role: Role
  initialPermissionKeys: string[]
  allPermissions: Permission[]
  canEdit: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [name, setName] = React.useState(role.name)
  const [description, setDescription] = React.useState(role.description || '')
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(
    new Set(initialPermissionKeys)
  )
  const [saving, setSaving] = React.useState(false)

  const isProtectedSystem = role.is_system && role.name === 'Site Admin'

  const togglePermission = (key: string) => {
    if (isProtectedSystem || !canEdit) return
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Toggle all permissions for an entire module group
  const toggleModule = (groupId: string, selectAll: boolean) => {
    if (isProtectedSystem || !canEdit) return
    const group = MODULE_GROUPS.find((g) => g.id === groupId)
    if (!group) return

    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const p of group.pages) {
        for (const action of p.actions) {
          const key = `${group.moduleKey}.${p.pageKey}.${action}`
          if (selectAll) {
            next.add(key)
          } else {
            next.delete(key)
          }
        }
      }
      return next
    })
  }

  // Select all or Clear all globally
  const handleGlobalToggle = (selectAll: boolean) => {
    if (isProtectedSystem || !canEdit) return
    if (selectAll) {
      setSelectedKeys(new Set(allPermissions.map((p) => p.key)))
    } else {
      setSelectedKeys(new Set())
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit || isProtectedSystem) return

    setSaving(true)

    // 1. Update Role metadata
    const formData = new FormData()
    formData.append('name', name)
    formData.append('description', description)
    const roleRes = await updateRoleAction(role.id, formData)

    if (!roleRes.success) {
      setSaving(false)
      toast(roleRes.error || 'Failed to update role details.', 'error')
      return
    }

    // 2. Update Role Permissions
    const permRes = await updateRolePermissionsAction(role.id, Array.from(selectedKeys))
    setSaving(false)

    if (permRes.success) {
      toast('Role and permission matrix updated successfully.', 'success')
      router.refresh()
    } else {
      toast(permRes.error || 'Failed to save permissions.', 'error')
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push('/administration/roles')}
            className="p-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-ink flex items-center gap-2">
              <span>{role.name}</span>
              {isProtectedSystem && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  System Role
                </span>
              )}
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">
              Configure access control permissions for this role.
            </p>
          </div>
        </div>

        {canEdit && !isProtectedSystem && (
          <Button
            type="submit"
            loading={saving}
            loadingText="Saving Permissions..."
            className="gap-1.5 shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>Save Role Permissions</span>
          </Button>
        )}
      </div>

      {/* System Role Notification */}
      {isProtectedSystem && (
        <div className="p-4 rounded-erp-lg bg-indigo-50 border border-indigo-200 flex items-start gap-3 text-indigo-900 text-xs">
          <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Protected Site Admin System Role</p>
            <p className="mt-0.5 text-indigo-700">
              The Site Admin role is permanently granted full access across all ERP modules. Its permissions cannot be stripped or modified to guarantee system continuity.
            </p>
          </div>
        </div>
      )}

      {/* Role Details Card */}
      <div className="bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
            Role Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isProtectedSystem || !canEdit}
            required
            className="w-full px-3 py-2 text-sm bg-white border border-surface-border rounded-erp text-ink disabled:bg-surface-muted disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isProtectedSystem || !canEdit}
            placeholder="Brief description of role responsibilities"
            className="w-full px-3 py-2 text-sm bg-white border border-surface-border rounded-erp text-ink disabled:bg-surface-muted disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Global Selection Shortcuts */}
      {!isProtectedSystem && canEdit && (
        <div className="flex items-center justify-between bg-surface-muted/60 p-3 rounded-erp border border-surface-border text-xs">
          <span className="font-semibold text-ink">Permission Matrix Configuration:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleGlobalToggle(true)}
              className="px-2.5 py-1 font-semibold text-brand hover:underline"
            >
              Select All Permissions
            </button>
            <span className="text-ink-light">•</span>
            <button
              type="button"
              onClick={() => handleGlobalToggle(false)}
              className="px-2.5 py-1 font-semibold text-ink-muted hover:underline"
            >
              Clear All Permissions
            </button>
          </div>
        </div>
      )}

      {/* Permissions Matrix Tables (§14) */}
      <div className="space-y-6">
        {MODULE_GROUPS.map((group) => {
          return (
            <div
              key={group.id}
              className="bg-white border border-surface-border rounded-erp-lg shadow-xs overflow-hidden"
            >
              {/* Module Header */}
              <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between">
                <span className="font-bold text-xs tracking-wider">{group.label}</span>
                {!isProtectedSystem && canEdit && (
                  <div className="flex items-center gap-3 text-[11px]">
                    <button
                      type="button"
                      onClick={() => toggleModule(group.id, true)}
                      className="text-slate-300 hover:text-white transition-colors"
                    >
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => toggleModule(group.id, false)}
                      className="text-slate-300 hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Matrix Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-border bg-slate-50 text-ink-muted font-semibold">
                      <th className="px-5 py-2.5 text-left w-1/3">PAGE / SECTION</th>
                      {STANDARD_ACTIONS.map((action) => (
                        <th key={action} className="px-3 py-2.5 text-center uppercase tracking-wider">
                          {action}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {group.pages.map((p) => {
                      return (
                        <tr key={p.pageKey} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-3 font-semibold text-ink">{p.label}</td>
                          {STANDARD_ACTIONS.map((action) => {
                            const isSupported = p.actions.includes(action)
                            const key = `${group.moduleKey}.${p.pageKey}.${action}`
                            const isChecked = isProtectedSystem || selectedKeys.has(key)

                            if (!isSupported) {
                              return (
                                <td key={action} className="text-center text-slate-300">
                                  —
                                </td>
                              )
                            }

                            return (
                              <td key={action} className="text-center py-2">
                                <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isProtectedSystem || !canEdit}
                                    onChange={() => togglePermission(key)}
                                    className="w-4 h-4 rounded text-brand border-surface-border focus:ring-brand disabled:opacity-75 disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {canEdit && !isProtectedSystem && (
        <div className="flex justify-end pt-4">
          <Button type="submit" loading={saving} size="lg" className="gap-2 shadow-sm">
            <Save className="w-4 h-4" />
            <span>Save Role Permissions</span>
          </Button>
        </div>
      )}
    </form>
  )
}
