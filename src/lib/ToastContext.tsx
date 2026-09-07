'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { EVENTO_FALHA } from './gravacaoDeFundo'

type ToastType = 'success' | 'error' | 'info'
// Uma ação opcional no próprio aviso — o padrão "Desfazer" que todo mundo
// conhece. Fica onde a pessoa acabou de agir, em vez de exigir que ela cace um
// botão em outra tela pra corrigir o que fez há 3 segundos.
type AcaoToast = { label: string; onClick: () => void | Promise<void> }
type Toast = { id: string; message: string; type: ToastType; acao?: AcaoToast }
type ToastCtx = { toast: (message: string, type?: ToastType, acao?: AcaoToast) => void }

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

  const toast = useCallback((message: string, type: ToastType = 'success', acao?: AcaoToast) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type, acao }])
    // Aviso com ação fica mais tempo: 3,2 s não dá pra ler, decidir e clicar.
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), acao ? 9000 : 3200)
  }, [])

  // Gravação de fundo que falhou vira aviso na tela.
  //
  // Registrar quem observa o card, gravar o histórico, gravar a notificação:
  // nada disso tem botão pra ficar vermelho, porque ninguém clicou. Até então
  // a falha virava `console.error` num console que ninguém abre — e o efeito
  // aparecia semanas depois como "fulano não foi avisado" ou "sumiu do
  // histórico", sem ninguém ligar uma coisa à outra.
  //
  // A lib avisa por evento porque não alcança este contexto do React. Aqui só
  // se escuta; se esta tela não estiver montada (num cron, por exemplo), o
  // evento cai no vazio sem custo.
  useEffect(() => {
    function aoFalhar(e: Event) {
      const { onde } = (e as CustomEvent<{ onde: string; detalhe: string }>).detail || { onde: 'algo' }
      toast(`Não consegui salvar: ${onde}. Recarregue e confira.`, 'error')
    }
    window.addEventListener(EVENTO_FALHA, aoFalhar)
    return () => window.removeEventListener(EVENTO_FALHA, aoFalhar)
  }, [toast])

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
