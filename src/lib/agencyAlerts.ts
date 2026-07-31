'use client'

import { createClient } from './supabase'
import { todayBrasiliaISO, addDaysISO } from './timezone'

// Alerta de agência é CONDIÇÃO, não evento — e essa diferença define tudo aqui.
//
// "Captação do Satō em 2 dias" continua verdade até a captação acontecer, e
// deixa de existir sozinha quando acontece. Por isso alerta não mora na tabela
// notifications: gravado, ou ele se duplicaria a cada verificação, ou ficaria
// marcado como lido enquanto o problema segue de pé.
//
// Consequência que também vale: alerta NÃO entra no contador vermelho do
// sininho. Sempre existe algum, então o contador nunca zeraria — e um contador
// que nunca zera é um contador que as pessoas aprendem a ignorar.

export type AgencyAlert = {
  id: string
  severity: 'alta' | 'media'
  label: string
  detail?: string
  href: string
}

export async function fetchAgencyAlerts(): Promise<AgencyAlert[]> {
  const supabase = createClient()
  const today = todayBrasiliaISO()
  const tomorrow = addDaysISO(today, 1)
  const in3Days = addDaysISO(today, 3)
  const days3Ago = addDaysISO(today, -3)

  const [captacoes, parados, urgentes, extrasVencidos] = await Promise.all([
    supabase.from('captacoes')
      .select('id, scheduled_date, clients(name)')
      .gte('scheduled_date', today).lte('scheduled_date', in3Days)
      .eq('status', 'agendada').order('scheduled_date').limit(10),
    // Aguardando o cliente há 3+ dias — é onde cronograma trava sem ninguém ver.
    supabase.from('schedules')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aguardando_aprovacao').lte('scheduled_date', days3Ago),
    // Sai hoje ou amanhã e ainda não está pronto.
    supabase.from('schedules')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_date', today).lte('scheduled_date', tomorrow)
      .not('status', 'in', '(agendado,publicado,aprovado)'),
    supabase.from('extras')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', today).neq('status', 'done'),
  ])

  const out: AgencyAlert[] = []

  const urgenteCount = urgentes.count || 0
  if (urgenteCount > 0) {
    out.push({
      id: 'urgentes', severity: 'alta',
      label: `${urgenteCount} ${urgenteCount === 1 ? 'post sai' : 'posts saem'} até amanhã sem estar pronto${urgenteCount === 1 ? '' : 's'}`,
      href: '/dashboard/kanban',
    })
  }

  const vencidos = extrasVencidos.count || 0
  if (vencidos > 0) {
    out.push({
      id: 'extras', severity: 'alta',
      label: `${vencidos} ${vencidos === 1 ? 'extra venceu' : 'extras venceram'}`,
      href: '/dashboard/extras',
    })
  }

  for (const c of (captacoes.data || []) as any[]) {
    const dias = Math.round((new Date(c.scheduled_date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
    out.push({
      id: `captacao-${c.id}`, severity: dias <= 1 ? 'alta' : 'media',
      label: `Captação ${c.clients?.name || 'sem cliente'}`,
      detail: dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`,
      href: '/dashboard/agenda',
    })
  }

  const parado = parados.count || 0
  if (parado > 0) {
    out.push({
      id: 'parados', severity: 'media',
      label: `${parado} ${parado === 1 ? 'post parado' : 'posts parados'} com o cliente há 3+ dias`,
      href: '/dashboard/aprovacao',
    })
  }

  return out
}
