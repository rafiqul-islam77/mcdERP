import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { Package, AlertTriangle, Clock, Bell, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'dashboard.view')

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white p-6 rounded-erp-lg border border-surface-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">
            Welcome back, {user.profile.name}
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            GMS Needle Management Warehouse System • Phase 1 Foundation Active
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-xs font-semibold text-ink block">{user.profile.roles?.name || 'Staff'}</span>
            <span className="text-[11px] text-ink-muted">{user.profile.employee_id}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-bold text-sm">
            {user.profile.name.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* KPI Cards Placeholder Grid (§38) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Needle Stock Card */}
        <div className="bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Needle Stock
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-brand flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-ink tracking-tight">—</div>
          <p className="text-[11px] text-ink-muted mt-2 leading-tight">
            Data will become available after Needle inventory modules are implemented in Phase 2.
          </p>
        </div>

        {/* Broken Needle Card */}
        <div className="bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Broken Needles
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-warning-dark flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-ink tracking-tight">—</div>
          <p className="text-[11px] text-ink-muted mt-2 leading-tight">
            Broken needle return tracking will be populated in Phase 2.
          </p>
        </div>

        {/* Idle Needle Card */}
        <div className="bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Idle Needles
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-ink tracking-tight">—</div>
          <p className="text-[11px] text-ink-muted mt-2 leading-tight">
            Floor-level idle machine needle monitoring activates in Phase 2.
          </p>
        </div>

        {/* Critical Alerts Card */}
        <div className="bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Critical Alerts
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-danger flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-ink tracking-tight">0</div>
          <p className="text-[11px] text-ink-muted mt-2 leading-tight">
            Threshold warnings and anomalous breakage alerts will activate in Phase 2.
          </p>
        </div>
      </div>

      {/* Phase 1 Status Overview Card */}
      <div className="bg-white rounded-erp-lg border border-surface-border shadow-xs p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-success" />
          <h2 className="text-base font-bold text-ink">Phase 1 Foundation Operational</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-erp bg-surface-muted border border-surface-border">
            <span className="font-semibold text-ink block mb-1">Identity & Authentication</span>
            <p className="text-ink-muted">
              Employee ID resolution, Supabase Auth encryption, and one-time activation/recovery token pipeline.
            </p>
          </div>

          <div className="p-4 rounded-erp bg-surface-muted border border-surface-border">
            <span className="font-semibold text-ink block mb-1">Role-Based Access Control</span>
            <p className="text-ink-muted">
              Dynamic permission matrices, module-gated dynamic sidebar, and protected system role constraints.
            </p>
          </div>

          <div className="p-4 rounded-erp bg-surface-muted border border-surface-border">
            <span className="font-semibold text-ink block mb-1">Audit Trail & Realtime Presence</span>
            <p className="text-ink-muted">
              Immutable operational audit logs and Supabase Realtime live presence tracking.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-surface-border flex items-center justify-between text-xs text-ink-muted">
          <span>Targeting GMS MCD Enterprise Production Standards</span>
          <Link
            href="/administration/employees"
            className="text-brand hover:text-brand-hover font-semibold inline-flex items-center gap-1"
          >
            Manage Employees →
          </Link>
        </div>
      </div>
    </div>
  )
}
