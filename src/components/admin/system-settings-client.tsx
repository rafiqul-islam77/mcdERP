'use client'

import React from 'react'
import { Settings, Save, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateSystemSettingsAction } from '@/app/actions/system-settings'
import type { SystemSetting } from '@/types'

interface SystemSettingsClientProps {
  initialSettings: SystemSetting[]
  canEdit: boolean
}

export function SystemSettingsClient({ initialSettings, canEdit }: SystemSettingsClientProps) {
  const getInitialValue = (key: string, legacyKey: string, defaultValue: string) => {
    const direct = initialSettings.find((item) => item.setting_key === key)
    if (direct?.setting_value) return direct.setting_value
    const legacy = initialSettings.find((item) => item.setting_key === legacyKey)
    if (legacy?.setting_value) return legacy.setting_value
    return defaultValue
  }

  // RUNNING
  const [runningDocNo, setRunningDocNo] = React.useState<string>(() =>
    getInitialValue('daily_report.running.document_no', 'daily_report.document_no', 'QA/03/310')
  )
  const [runningVerNo, setRunningVerNo] = React.useState<string>(() =>
    getInitialValue('daily_report.running.version_no', 'daily_report.version_no', '01/2026')
  )

  // NEW
  const [newDocNo, setNewDocNo] = React.useState<string>(() =>
    getInitialValue('daily_report.new.document_no', 'daily_report.document_no', 'QA/03/310')
  )
  const [newVerNo, setNewVerNo] = React.useState<string>(() =>
    getInitialValue('daily_report.new.version_no', 'daily_report.version_no', '01/2026')
  )

  // IDLE
  const [idleDocNo, setIdleDocNo] = React.useState<string>(() =>
    getInitialValue('daily_report.idle.document_no', 'daily_report.document_no', 'QA/03/310')
  )
  const [idleVerNo, setIdleVerNo] = React.useState<string>(() =>
    getInitialValue('daily_report.idle.version_no', 'daily_report.version_no', '01/2026')
  )

  const [saving, setSaving] = React.useState<boolean>(false)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return

    setSaving(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      const res = await updateSystemSettingsAction([
        { setting_key: 'daily_report.running.document_no', setting_value: runningDocNo },
        { setting_key: 'daily_report.running.version_no', setting_value: runningVerNo },
        { setting_key: 'daily_report.new.document_no', setting_value: newDocNo },
        { setting_key: 'daily_report.new.version_no', setting_value: newVerNo },
        { setting_key: 'daily_report.idle.document_no', setting_value: idleDocNo },
        { setting_key: 'daily_report.idle.version_no', setting_value: idleVerNo },
      ])

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update system settings.')
      } else {
        setSuccessMessage('Category-specific report settings updated successfully and logged in audit trail.')
        setTimeout(() => setSuccessMessage(null), 4000)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-brand" />
          <span>System Settings</span>
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Centrally managed configuration parameters for reports and ERP documentation.
        </p>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3.5 rounded-erp bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-erp bg-success/10 border border-success/30 text-success text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {!canEdit && (
        <div className="p-3 rounded-erp bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>You have view-only access. You need administration edit permission to modify settings.</span>
        </div>
      )}

      {/* Settings Form Card */}
      <form onSubmit={handleSave} className="bg-surface border border-surface-border rounded-erp shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/60 dark:bg-slate-800/40 border-b border-surface-border">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <span>Daily Report Configuration</span>
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Configure official Document Number and Version Number printed on Present Balance reports by category.
          </p>
        </div>

        <div className="p-6 space-y-6 divide-y divide-surface-border">
          {/* RUNNING NEEDLE */}
          <div className="space-y-4 pt-1 first:pt-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                RUNNING
              </span>
              <span className="text-xs font-semibold text-ink">Running Needle Present Balance Report</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Document No. <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEdit || saving}
                  value={runningDocNo}
                  onChange={(e) => setRunningDocNo(e.target.value)}
                  placeholder="e.g. QA/03/310"
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Version No. <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEdit || saving}
                  value={runningVerNo}
                  onChange={(e) => setRunningVerNo(e.target.value)}
                  placeholder="e.g. 01/2026"
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* NEW NEEDLE */}
          <div className="space-y-4 pt-5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                NEW
              </span>
              <span className="text-xs font-semibold text-ink">New Needle Present Balance Report</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Document No. <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEdit || saving}
                  value={newDocNo}
                  onChange={(e) => setNewDocNo(e.target.value)}
                  placeholder="e.g. QA/03/310"
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Version No. <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEdit || saving}
                  value={newVerNo}
                  onChange={(e) => setNewVerNo(e.target.value)}
                  placeholder="e.g. 01/2026"
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* IDLE NEEDLE */}
          <div className="space-y-4 pt-5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                IDLE
              </span>
              <span className="text-xs font-semibold text-ink">Idle Needle Present Balance Report</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Document No. <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEdit || saving}
                  value={idleDocNo}
                  onChange={(e) => setIdleDocNo(e.target.value)}
                  placeholder="e.g. QA/03/310"
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Version No. <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEdit || saving}
                  value={idleVerNo}
                  onChange={(e) => setIdleVerNo(e.target.value)}
                  placeholder="e.g. 01/2026"
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer / Submit Button */}
        {canEdit && (
          <div className="p-4 bg-slate-50/60 dark:bg-slate-800/40 border-t border-surface-border flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              loading={saving}
              loadingText="Saving Changes..."
              className="px-5 text-xs font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
