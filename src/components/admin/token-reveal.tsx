'use client'

import * as React from 'react'
import { Eye, Copy, Check, Lock, Loader2 } from 'lucide-react'
import { revealTokenAction } from '@/app/actions/employees'
import { useToast } from '@/components/ui/toast'

export function TokenReveal({
  userId,
  hasActiveToken,
  canViewToken,
}: {
  userId: string
  hasActiveToken: boolean
  canViewToken: boolean
}) {
  const { toast } = useToast()
  const [revealed, setRevealed] = React.useState(false)
  const [tokenValue, setTokenValue] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  if (!hasActiveToken) {
    return <span className="text-ink-muted text-xs">—</span>
  }

  if (!canViewToken) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted italic">
        <Lock className="w-3 h-3 text-ink-light" />
        Restricted
      </span>
    )
  }

  const handleReveal = async () => {
    setLoading(true)
    const res = await revealTokenAction(userId)
    setLoading(false)

    if (res.success && res.data) {
      setTokenValue(res.data.token)
      setRevealed(true)
    } else if (!res.success) {
      toast(res.error || 'Failed to reveal token', 'error')
    }
  }

  const handleCopy = () => {
    if (!tokenValue) return
    navigator.clipboard.writeText(tokenValue)
    setCopied(true)
    toast('Token copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  if (revealed && tokenValue) {
    return (
      <div className="inline-flex items-center gap-1.5 bg-brand/5 border border-brand/20 px-2 py-0.5 rounded-erp">
        <span className="font-mono text-xs font-bold text-brand tracking-wider select-all">
          {tokenValue}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 text-brand hover:text-brand-hover hover:bg-brand/10 rounded transition-colors"
          title="Copy token"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs text-ink-muted tracking-widest">••••-••••</span>
      <button
        type="button"
        onClick={handleReveal}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-brand bg-brand/10 hover:bg-brand/20 rounded-erp transition-colors disabled:opacity-50 min-w-[56px] justify-center"
      >
        {loading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Loading...</span>
          </>
        ) : (
          <>
            <Eye className="w-3 h-3" />
            <span>Reveal</span>
          </>
        )}
      </button>
    </div>
  )
}
