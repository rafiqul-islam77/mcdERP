'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Lock, User, AlertCircle, ArrowRight } from 'lucide-react'
import { loginAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/types'

function LoginForm() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const [state, setState] = React.useState<ActionResult | null>(null)
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setState(null)

    const formData = new FormData(e.currentTarget)
    try {
      const res = await loginAction(null, formData)
      if (res && !res.success) {
        setState(res)
      }
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'digest' in err &&
        typeof (err as { digest: string }).digest === 'string' &&
        (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
      ) {
        throw err
      }
      setState({ success: false, error: 'Authentication failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand to-indigo-600 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-lg shadow-brand/25 mb-4">
          G
        </div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">GMS MCD ERP</h1>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mt-1">
          Needle Warehouse Management
        </p>
      </div>

      {/* Main Login Card */}
      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp-lg p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ink">Sign In to Your Account</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Enter your official Employee ID and password to proceed.
          </p>
        </div>

        {/* Global Error Banner */}
        {(state?.error || errorParam) && (
          <div className="mb-5 p-3 rounded-erp bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {errorParam === 'disabled'
                ? 'Your account is disabled. Contact the system administrator.'
                : state?.error || 'Authentication error.'}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
              Employee ID
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-light">
                <User className="w-4 h-4" />
              </span>
              <input
                name="employeeId"
                type="text"
                required
                autoComplete="username"
                placeholder="e.g. EMP-001"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-surface-border rounded-erp text-ink placeholder:text-ink-light uppercase focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-light">
                <Lock className="w-4 h-4" />
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-surface-border rounded-erp text-ink placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
              />
            </div>
          </div>

          <Button
            type="submit"
            loading={loading}
            loadingText="Signing in..."
            className="w-full py-2.5 mt-2 font-semibold"
          >
            <span>Sign In</span>
            {!loading && <ArrowRight className="w-4 h-4 ml-1" />}
          </Button>
        </form>

        {/* Action Links */}
        <div className="mt-6 pt-5 border-t border-surface-border flex flex-col gap-2.5 text-center text-xs">
          <Link
            href="/activate"
            className="text-brand hover:text-brand-hover font-semibold transition-colors"
          >
            First time login? Activate Account →
          </Link>

          <Link
            href="/recover"
            className="text-ink-muted hover:text-ink font-medium transition-colors"
          >
            Recover Account using Admin Token
          </Link>
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-ink-muted">
        GMS Composite Knitting Industries Ltd. • Strictly Confidential
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="w-full max-w-md mx-auto text-center p-12 text-ink-muted text-xs">
          Loading login portal...
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  )
}
