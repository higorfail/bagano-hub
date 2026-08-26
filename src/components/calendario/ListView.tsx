'use client'

import { useMemo } from 'react'
import ItemChip, { rotulo } from './ItemChip'
import { ordenarDoDia, type CalItem } from '@/lib/calendarItems'

// A visão de lista — tudo do período, em ordem, sem nada escondido.
//
// É a resposta mais direta ao "+6 mais": a grade sempre vai ter um limite de
// espaço por dia, mas a lista não tem. Serve pra semana pesada (25/08 tem 10
// itens) e pra quando a pergunta é "o que sai essa semana", que numa grade
// obriga a varrer sete colunas com o olho.

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const DIAS  = ['dom','seg','ter','qua','qui','sex','sáb']

export default function ListView({ itens, hoje, onOpen }: {
  itens: CalItem[]
  hoje: string
  onOpen: (item: CalItem) => void
}) {
  const porDia = useMemo(() => {
    const m = new Map<string, CalItem[]>()
    for (const i of itens) {
      if (!m.has(i.date)) m.set(i.date, [])
      m.get(i.date)!.push(i)
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, is]) => [dia, is.sort(ordenarDoDia)] as const)
  }, [itens])

  if (!porDia.length) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl py-12 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">Nada neste período.</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border)]">
      {porDia.map(([dia, is]) => {
        const d = new Date(dia + 'T12:00:00')
        const ehHoje = dia === hoje
        return (
          <div key={dia} className="flex gap-3 px-4 py-3">
            <div className="w-11 flex-shrink-0 text-center">
              <div className={`text-lg font-bold leading-none ${ehHoje ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
                {d.getDate()}
              </div>
              <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                {MESES[d.getMonth()]} · {DIAS[d.getDay()]}
              </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {is.map(i => (
                <div key={i.key} className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-text-faint)] w-14 flex-shrink-0 text-right">
                    {i.startTime || rotulo(i.kind)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <ItemChip item={i} onClick={() => onOpen(i)} className="!text-[11px]" />
                  </div>
                  {i.clientName && (
                    <span className="text-[10px] text-[var(--color-text-faint)] hidden md:block flex-shrink-0 max-w-[120px] truncate">
                      {i.clientName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
