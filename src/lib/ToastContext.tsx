'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: string; message: string; type: ToastType }
type ToastCtx = { toast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
}
const STYLES: Record<ToastType, string> = {
  success: 'bg-[#1a1a1a] text-white border-[var(--ds-success-accent)]/40',
  error:   'bg-[#1a1a1a] text-white border-[var(--ds-error-accent)]/40',
  info:    'bg-[#1a1a1a] text-white border-[var(--ds-info-accent)]/40',
}
const DOT: Record<ToastType, string> = {
  success: 'bg-[var(--ds-success-accent)]',
  error:   'bg-[var(--ds-error-accent)]',
  info:    'bg-[var(--ds-info-accent)]',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[300] pointer-events-none">
          {toasts.map(t => (
            <div key={t.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium ${STYLES[t.type]}`}
              style={{ animation: 'slideIn 0.2s ease-out' }}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[t.type]}`} />
              {t.message}
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
