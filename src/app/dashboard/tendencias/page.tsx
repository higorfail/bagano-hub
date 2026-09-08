'use client'

import { useEffect } from 'react'
import TendenciasView from '@/components/TendenciasView'
import ConcorrentesPainel from '@/components/ConcorrentesPainel'

export default function TendenciasPage() {
  useEffect(() => { document.title = 'Tendências · Bagano Hub' }, [])
  return (
    <div className="p-4 md:p-6">
      <TendenciasView heading={
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Tendências</h1>
          <p className="text-[var(--color-text-muted)] text-xs mt-0.5">O que está em alta no nicho — e o gancho pra usar em cliente de gastronomia.</p>
        </div>
      } />
      {/* Fica embaixo e fechado: é ajuste que se faz uma vez, não leitura do dia. */}
      <div className="max-w-3xl mt-5"><ConcorrentesPainel /></div>
    </div>
  )
}
