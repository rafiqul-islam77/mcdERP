import { requireActiveAccount } from '@/lib/auth'
import { requirePermission, hasPermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, Shield, ShieldCheck, Edit2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Role } from '@/types'

export default async function RolesPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.roles.view')

  const admin = getAdminClient()

  // Fetch roles
  const { data: roles } = await admin
    .from('roles')
    .select('*')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })

  // Fetch user count per role
  const { data: profiles } = await admin
    .from('profiles')
    .select('role_id')

  const roleUserCounts: Record<string, number> = {}
  for (const p of profiles || []) {
    if (p.role_id) {
      roleUserCounts[p.role_id] = (roleUserCounts[p.role_id] || 0) + 1
    }
  }

  const [canCreate, canEdit] = await Promise.all([
    hasPermission(user.profile.id, 'admin.roles.create'),
    hasPermission(user.profile.id, 'admin.roles.edit'),
  ])

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          <h1 className="text-xl font-bold text-ink">Roles & Permissions</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Define system roles and configure granular permission matrices for staff access control.
          </p>
        </div>

        {canCreate && (
          <Link href="/administration/roles/new">
            <Button className="gap-1.5 shadow-sm">
              <Plus className="w-4 h-4" />
              <span>Create Role</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Roles Table */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-erp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Description</th>
                <th className="text-center w-28">Assigned Staff</th>
                <th className="text-center w-28">Role Type</th>
                <th className="text-center w-24">Status</th>
                <th className="text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {(roles || []).map((role: Role) => {
                const userCount = roleUserCounts[role.id] || 0

                return (
                  <tr key={role.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="font-semibold text-ink whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {role.is_system ? (
                          <ShieldCheck className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Shield className="w-4 h-4 text-ink-light" />
                        )}
                        <span>{role.name}</span>
                      </div>
                    </td>

                    <td className="text-ink-muted">{role.description || '—'}</td>

                    <td className="text-center font-medium">
                      <span className="inline-flex items-center gap-1 text-ink-muted">
                        <Users className="w-3 h-3 text-ink-light" />
                        {userCount}
                      </span>
                    </td>

                    <td className="text-center whitespace-nowrap">
                      {role.is_system ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          System Protected
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                          Custom Role
                        </span>
                      )}
                    </td>

                    <td className="text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          role.active
                            ? 'bg-success/15 text-success-dark border-success/30'
                            : 'bg-surface-muted text-ink-muted border-surface-border'
                        }`}
                      >
                        {role.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="text-right whitespace-nowrap">
                      <Link href={`/administration/roles/${role.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs">
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          {canEdit && !role.is_system ? 'Configure' : 'View Matrix'}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
