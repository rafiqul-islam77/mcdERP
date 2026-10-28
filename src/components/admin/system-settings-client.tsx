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
  const [docNo, setDocNo] = React.useState<string>(() => {
    const s = initialSettings.find((item) => item.setting_key === 'daily_report.document_no')
    return s?.setting_value || 'QA/03/310'
  })

  const [verNo, setVerNo] = React.useState<string>(() => {
    const s = initialSettings.find((item) => item.setting_key === 'daily_report.version_no')
    return s?.setting_value || '01/2026'
  })

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
        { setting_key: 'daily_report.document_no', setting_value: docNo },
        { setting_key: 'daily_report.version_no', setting_value: verNo },
      ])

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update system settings.')
      } else {
        setSuccessMessage('System settings updated successfully and logged in audit trail.')
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
            Configure official Document Number and Version Number printed on all Present Balance reports.
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Document No */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                Document No. <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!canEdit || saving}
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="e.g. QA/03/310"
                className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
              />
              <p className="text-[11px] text-ink-muted">
                Official document identifier code (e.g. QA/03/310).
              </p>
            </div>

            {/* Version No */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                Version No. <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!canEdit || saving}
                value={verNo}
                onChange={(e) => setVerNo(e.target.value)}
                placeholder="e.g. 01/2026"
                className="w-full text-xs font-mono font-medium px-3 py-2 rounded-erp border border-surface-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
              />
              <p className="text-[11px] text-ink-muted">
                Active version identifier (e.g. 01/2026).
              </p>
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
