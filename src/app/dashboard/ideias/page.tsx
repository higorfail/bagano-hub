'use client'

import { useEffect } from 'react'
import IdeiasView from '@/components/IdeiasView'

// A tela mora em `components/IdeiasView` — a página do cliente usa a mesma,
// recortada num cliente só.
export default function IdeiasPage() {
  useEffect(() => { document.title = 'Ideias · Bagano Hub' }, [])
  return (
    <div className="p-4 md:p-6">
      <IdeiasView heading={
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Ideias</h1>
          <p className="text-[var(--color-text-muted)] text-xs mt-0.5">O que veio do grupo, do cliente ou da rua — antes de virar pauta.</p>
        </div>
      } />
    </div>
  )
}
