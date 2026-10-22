import Link from 'next/link'
import { Construction, ArrowLeft } from 'lucide-react'

export function ModulePlaceholder({
  moduleName,
  pageName,
  permissionKey,
  description,
}: {
  moduleName: string
  pageName: string
  permissionKey: string
  description?: string
}) {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-8 sm:p-12 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand mx-auto mb-2">
          <Construction className="w-7 h-7" />
        </div>

        <div>
          <span className="text-[10px] font-bold tracking-widest uppercase text-brand bg-brand/10 px-2.5 py-1 rounded-full">
            {moduleName}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-ink mt-2">{pageName}</h1>
          <p className="text-xs text-ink-muted max-w-md mx-auto mt-2 leading-relaxed">
            {description || 'This module will be implemented in a later development phase (Phase 2).'}
          </p>
        </div>

        <div className="p-3 bg-surface-muted rounded-erp text-xs text-ink-muted inline-flex items-center gap-2 border border-surface-border font-mono">
          <span>Required Permission:</span>
          <span className="font-semibold text-brand">{permissionKey}</span>
          <span className="text-success font-semibold">✓ Verified</span>
        </div>

        <div className="pt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-brand hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
