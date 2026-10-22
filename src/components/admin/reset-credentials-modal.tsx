'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { resetCredentialsAction } from '@/app/actions/employees'
import { AlertTriangle, Copy, Check, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type { EmployeeRow } from '@/types'

export function ResetCredentialsModal({
  isOpen,
  onClose,
  employee,
}: {
  isOpen: boolean
  onClose: () => void
  employee: EmployeeRow | null
}) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(false)
  const [generatedToken, setGeneratedToken] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  // Reset state when opened with a new employee
  React.useEffect(() => {
    if (isOpen) {
      setGeneratedToken(null)
      setCopied(false)
    }
  }, [isOpen])

  if (!employee) return null

  const handleConfirmReset = async () => {
    setLoading(true)
    const res = await resetCredentialsAction(employee.id)
    setLoading(false)

    if (res.success && res.data) {
      setGeneratedToken(res.data.recoveryToken)
      toast('Credentials reset and new recovery token issued', 'success')
    } else if (!res.success) {
      toast(res.error || 'Failed to reset credentials', 'error')
    }
  }

  const handleCopy = () => {
    if (!generatedToken) return
    navigator.clipboard.writeText(generatedToken)
    setCopied(true)
    toast('Recovery token copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={generatedToken ? 'Credential Reset Successful' : 'Reset Employee Credentials'}
      maxWidth="md"
    >
      {!generatedToken ? (
        <div className="space-y-4">
          <div className="p-3.5 rounded-erp bg-warning/10 border border-warning/20 flex items-start gap-3 text-warning-dark text-xs">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink text-sm mb-1">
                Reset credentials for {employee.employee_id} — {employee.name}?
              </p>
              <p className="text-ink-muted">
                The employee&apos;s current password and all active login sessions will immediately stop working. A new single-use recovery token will be generated.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmReset}
              loading={loading}
              loadingText="Resetting..."
            >
              Reset & Generate Token
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-success text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-success" />
            New Recovery Token Generated
          </div>

          <div className="p-4 bg-surface-muted rounded-erp border border-surface-border text-center space-y-2">
            <div className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
              Employee: {employee.employee_id} • {employee.name}
            </div>
            <div className="text-2xl font-mono font-bold text-brand tracking-widest select-all py-1">
              {generatedToken}
            </div>
            <p className="text-[11px] text-ink-muted">
              Share this recovery token with the employee. They will use it at /recover to set a new password.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Token'}
            </Button>

            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
