'use client'

import * as React from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: ModalProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Dialog */}
      <div
        className={`relative w-full ${widthClasses[maxWidth]} bg-white rounded-erp-lg shadow-xl border border-surface-border overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150`}
        role="dialog"
        aria-modal="true"
      >
        {(title || description) && (
          <div className="px-6 py-4 border-b border-surface-border flex items-start justify-between">
            <div>
              {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
              {description && <p className="text-xs text-ink-muted mt-1">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-ink-light hover:text-ink transition-colors p-1 rounded-md hover:bg-surface-muted"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">{children}</div>

        {footer && <div className="px-6 py-3.5 bg-surface-muted/50 border-t border-surface-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
