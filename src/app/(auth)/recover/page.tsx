'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import { verifyRecoveryTokenAction, completeRecoveryAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function RecoverPage() {
  const router = useRouter()
  const [step, setStep] = React.useState<'verify' | 'setPassword' | 'success'>('verify')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [verifiedContext, setVerifiedContext] = React.useState<{
    userId: string
    tokenId: string
    employeeId: string
  } | null>(null)

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const res = await verifyRecoveryTokenAction(formData)

    setLoading(false)
    if (res.success && res.data) {
      setVerifiedContext(res.data)
      setStep('setPassword')
    } else {
      setError(res.error || 'Verification failed.')
    }
  }

  const handleSetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!verifiedContext) return

    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const res = await completeRecoveryAction(
      verifiedContext.userId,
      verifiedContext.tokenId,
      formData
    )

    setLoading(false)
    if (res.success) {
      setStep('success')
    } else {
      setError(res.error || 'Failed to update password.')
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand to-indigo-600 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-lg shadow-brand/25 mb-4">
          G
        </div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Account Recovery</h1>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mt-1">
          GMS MCD Warehouse ERP
        </p>
      </div>

      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp-lg p-6 sm:p-8">
        {error && (
          <div className="mb-5 p-3 rounded-erp bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* STEP 1: VERIFY RECOVERY TOKEN */}
        {step === 'verify' && (
          <div>
            <div className="mb-6">
              <h2 className="text-base font-semibold text-ink">Reset Your Credentials</h2>
              <p className="text-xs text-ink-muted mt-1">
                Enter your Employee ID and the recovery token provided by your Site Administrator.
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <Input
                label="Employee ID"
                name="employeeId"
                placeholder="e.g. EMP-001"
                required
                className="uppercase"
              />

              <Input
                label="Recovery Token"
                name="token"
                placeholder="e.g. R8K2-Q9LM"
                required
                className="uppercase font-mono tracking-wider"
                hint="Tokens are single-use and formatted like XXXX-XXXX"
              />

              <Button
                type="submit"
                loading={loading}
                loadingText="Verifying Token..."
                className="w-full py-2.5 mt-2 font-semibold"
              >
                Verify Token & Continue →
              </Button>
            </form>
          </div>
        )}

        {/* STEP 2: SET NEW PASSWORD */}
        {step === 'setPassword' && verifiedContext && (
          <div>
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand/10 text-brand rounded-full text-xs font-semibold mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Recovery Token Verified for {verifiedContext.employeeId}
              </div>
              <h2 className="text-base font-semibold text-ink">Create New Password</h2>
              <p className="text-xs text-ink-muted mt-1">
                Enter your new password. All existing sessions will be invalidated.
              </p>
            </div>

            <form onSubmit={handleSetPassword} className="space-y-4">
              <Input
                label="New Password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="new-password"
                hint="At least 8 characters"
              />

              <Input
                label="Confirm New Password"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />

              <Button
                type="submit"
                loading={loading}
                loadingText="Updating Password..."
                className="w-full py-2.5 mt-2 font-semibold"
              >
                Update Password & Re-activate
              </Button>
            </form>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'success' && (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-success/15 text-success mx-auto flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-ink">Password Reset Complete!</h2>
            <p className="text-xs text-ink-muted mt-2 mb-6">
              Your password has been securely reset and your account is active again.
            </p>
            <Button
              onClick={() => router.push('/login')}
              className="w-full py-2.5 font-semibold"
            >
              Sign In with New Password →
            </Button>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="mt-6 pt-5 border-t border-surface-border text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
