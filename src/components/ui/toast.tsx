'use client'

import * as React from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, message, type }])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const config: Record<ToastType, { border: string; icon: React.ReactNode }> = {
            success: {
              border: 'border-l-4 border-l-success',
              icon: <CheckCircle2 className="w-4 h-4 text-success shrink-0" />,
            },
            error: {
              border: 'border-l-4 border-l-danger',
              icon: <AlertCircle className="w-4 h-4 text-danger shrink-0" />,
            },
            warning: {
              border: 'border-l-4 border-l-warning',
              icon: <AlertTriangle className="w-4 h-4 text-warning shrink-0" />,
            },
            info: {
              border: 'border-l-4 border-l-brand',
              icon: <Info className="w-4 h-4 text-brand shrink-0" />,
            },
          }

          const current = config[t.type]

          return (
            <div
              key={t.id}
              className={`p-3.5 rounded-erp-lg shadow-xl text-xs font-semibold flex items-center justify-between pointer-events-auto transition-all animate-in slide-in-from-bottom-2 bg-slate-900/95 text-white border border-slate-800 backdrop-blur-sm ${current.border}`}
            >
              <div className="flex items-center gap-2.5">
                {current.icon}
                <span className="leading-snug">{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="ml-3 p-1 text-slate-400 hover:text-white rounded transition-colors"
                aria-label="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    return {
      toast: (msg: string) => console.log('Toast:', msg),
    }
  }
  return ctx
}
