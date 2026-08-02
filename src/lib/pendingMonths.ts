'use client'

import { useEffect, useState } from 'react'
import { createClient } from './supabase'

// Quais meses daquele cliente ainda têm post esperando resposta.
//
// Cronograma e aba do cliente abrem no mês corrente. No dia 1º isso significa
// abrir num mês vazio, ou meio montado, sem nada na tela dizendo que o mês
// anterior tem oito posts parados com o cliente. A pessoa tinha que adivinhar
// que precisava voltar um mês — e ninguém adivinha o que não sabe que existe.
//
// "Esperando" aqui inclui as duas conversas: aprovação da pauta (crono) e
// aprovação da arte (final), mais o ajuste pedido. Todas são a bola com o
// cliente ou com a gente, nenhuma está fechada.
export const PENDING_STATUSES = ['aguardando_aprovacao_crono', 'aguardando_aprovacao', 'ajuste']

export type PendingMonths = Record<string, number>

export const periodKey = (month: number, year: number) => `${month}-${year}`

export function usePendingMonths(clientId: string | null | undefined): PendingMonths {
  const [map, setMap] = useState<PendingMonths>({})

  useEffect(() => {
    if (!clientId) { setMap({}); return }
    let alive = true
    createClient().from('schedules')
      .select('month, year')
      .eq('client_id', clientId)
      .in('status', PENDING_STATUSES)
      .then(({ data }) => {
        if (!alive) return
        const out: PendingMonths = {}
        for (const r of (data || []) as { month: number; year: number }[]) {
          const k = periodKey(r.month, r.year)
          out[k] = (out[k] || 0) + 1
        }
        setMap(out)
      })
    return () => { alive = false }
  }, [clientId])

  return map
}

// O mês pendente mais ANTIGO que não é o que está aberto na tela — é o que
// some do radar quando o calendário vira, e o que precisa de cobrança.
export function oldestOtherPending(map: PendingMonths, curMonth: number, curYear: number) {
  const others = Object.entries(map)
    .map(([k, count]) => {
      const [m, y] = k.split('-').map(Number)
      return { month: m, year: y, count }
    })
    .filter(p => !(p.month === curMonth && p.year === curYear))
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
  return others[0] || null
}
