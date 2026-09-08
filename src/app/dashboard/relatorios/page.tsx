'use client'

import { useEffect } from 'react'
import RelatorioMensal from '@/components/RelatorioMensal'

export default function RelatoriosPage() {
  useEffect(() => { document.title = 'Relatórios · Bagano Hub' }, [])
  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
      <div className="nao-imprime">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Relatórios</h1>
        <p className="text-[var(--color-text-muted)] text-xs mt-0.5">O mês fechado do cliente — o que entregamos vem contado, o que o Instagram sabe você preenche.</p>
      </div>
      <RelatorioMensal />
    </div>
  )
}
