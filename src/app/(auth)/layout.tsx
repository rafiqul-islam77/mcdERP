import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      {/* Company branding */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-brand rounded-erp-lg mb-3">
          <svg
            className="w-7 h-7 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-ink tracking-tight">GMS MCD ERP</h1>
        <p className="text-sm text-ink-muted mt-0.5">Enterprise Resource Planning</p>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm">
        {children}
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-ink-light text-center">
        &copy; {new Date().getFullYear()} GMS Needle Management. All rights reserved.
      </p>
    </div>
  )
}
