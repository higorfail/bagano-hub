'use client'

import { createClient } from './supabase'
import { todayBrasiliaISO, addDaysISO } from './timezone'
import { activeClientIds } from './activeClients'

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

  // Aqui o recorte de cliente ativo tem que ir DENTRO da consulta, não depois:
  // dois destes alertas são contagem feita no servidor (`head: true`), e não
  // volta linha nenhuma pra filtrar do lado de cá. Sem isso, desativar um
  // cliente deixava os posts dele inflando "sai até amanhã" e "extra vencido"
  // pra sempre, num número que ninguém conseguia zerar.
  const idsAtivos = [...(await activeClientIds(supabase))]

  const [captacoes, parados, urgentes, extrasVencidos] = await Promise.all([
    supabase.from('captacoes')
      .select('id, scheduled_date, clients(name)')
      .in('client_id', idsAtivos)
      .gte('scheduled_date', today).lte('scheduled_date', in3Days)
      .eq('status', 'agendada').order('scheduled_date').limit(10),
    // Aguardando o cliente há 3+ dias — é onde o cronograma trava sem ninguém
    // ver. Traz os ids; o tempo de espera é medido depois, no activity_log.
    supabase.from('schedules')
      .select('id, title, client_id, month, year')
      .in('client_id', idsAtivos)
      .eq('status', 'aguardando_aprovacao'),
    // Sai hoje ou amanhã e ainda não está pronto.
    supabase.from('schedules')
      .select('id', { count: 'exact', head: true })
      .in('client_id', idsAtivos)
      .gte('scheduled_date', today).lte('scheduled_date', tomorrow)
      .not('status', 'in', '(agendado,publicado,aprovado)'),
    supabase.from('extras')
      .select('id', { count: 'exact', head: true })
      .in('client_id', idsAtivos)
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

  // Quanto tempo o post está com o cliente vem do activity_log — o momento em
  // que ele entrou em "aguardando aprovação".
  //
  // Antes isso era medido por `scheduled_date <= 3 dias atrás`, que é a data
  // de PUBLICAÇÃO e não tem relação com quando foi enviado pra aprovar. O
  // alerta acabava contando "posts cuja data de publicação já passou", coisa
  // bem mais rara: dizia 1 com 16 posts aguardando. Post sem data marcada nem
  // entrava na conta, porque `lte` descarta nulo.
  const waitingPosts = (parados.data || []) as any[]
  let stuck: any[] = []
  if (waitingPosts.length) {
    const { data: logs } = await supabase.from('activity_log')
      .select('record_id, created_at')
      .eq('table_name', 'schedules').eq('action', 'status_changed')
      .in('record_id', waitingPosts.map(p => p.id))
      .ilike('description', '%aguardando aprova%')
      .order('created_at', { ascending: false })

    const sentAt = new Map<string, string>()
    for (const l of (logs || []) as any[]) if (!sentAt.has(l.record_id)) sentAt.set(l.record_id, l.created_at)

    const cutoff = Date.now() - 3 * 86400000
    stuck = waitingPosts.filter(p => {
      const at = sentAt.get(p.id)
      return at ? new Date(at).getTime() <= cutoff : false
    })
  }

  if (stuck.length > 0) {
    // Com um só, abre o post. Cair na lista inteira pra procurar o único item
    // que o alerta acabou de nomear é trabalho que o hub podia poupar.
    const only = stuck.length === 1 ? stuck[0] : null
    out.push({
      id: 'parados', severity: 'media',
      label: `${stuck.length} ${stuck.length === 1 ? 'post parado' : 'posts parados'} com o cliente há 3+ dias`,
      detail: only ? only.title : undefined,
      href: only
        ? `/dashboard/aprovacao?client=${only.client_id}&highlight=${only.id}&kind=post`
        : '/dashboard/aprovacao?filter=aguardando',
    })
  }

  return out
}
