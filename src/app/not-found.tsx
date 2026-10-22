import Link from 'next/link'
import { FileQuestion, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand mb-4 shadow-sm">
        <FileQuestion className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-ink">Page Not Found</h1>
      <p className="text-sm text-ink-muted max-w-md mt-2 mb-6">
        The requested ERP page or resource does not exist or has been relocated.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-erp hover:bg-brand-hover transition-colors shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Dashboard
      </Link>
    </div>
  )
}
