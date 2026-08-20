'use client'

import { createClient } from './supabase'

export type NotificationRow = {
  id: string
  member_id: string
  card_table: string | null
  card_id: string | null
  client_id: string | null
  kind: string
  actor_name: string | null
  actor_id: string | null
  title: string | null
  card_type: string | null
  card_number: number | null
  body: string
  url: string | null
  card_deleted: boolean | null
  read_at: string | null
  created_at: string
}

/** Rótulo e cor do selo de tipo — "Reels", "Extra", "Material"… */
export const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  carrossel:         { label: 'Carrossel',  color: '#3b82f6' },
  reels:             { label: 'Reels',      color: '#ef4444' },
  post:              { label: 'Post',       color: '#f59e0b' },
  story:             { label: 'Story',      color: '#8b5cf6' },
  carrossel_stories: { label: 'Carrossel/Stories', color: '#6366f1' }, post_story: { label: 'Post/Story', color: '#d946ef' },
  material:          { label: 'Material',   color: '#0ea5e9' },
  extra:             { label: 'Extra',      color: '#14b8a6' },
  tarefa:            { label: 'Tarefa',     color: '#6b7280' },
  lembrete:          { label: 'Lembrete',   color: '#f59e0b' },
  nota:              { label: 'Nota',       color: '#8b5cf6' },
  cronograma:        { label: 'Cronograma', color: '#6366f1' },
}

/**
 * Comentário vira balão, não linha de log. O activity_log grava a descrição
 * como `Fulano comentou: "texto"` — aqui separamos as duas partes pra lista
 * mostrar quem falou e o que falou, como no Trello, em vez de repetir o nome
 * dentro de uma frase corrida.
 */
export function splitComment(body: string): { author: string; text: string } | null {
  const m = body.match(/^(.+?) comentou: "([\s\S]*)"$/)
  if (!m) return null
  return { author: m[1], text: m[2] }
}

/**
 * Um card com todos os eventos dele. É assim que o Trello mostra: três
 * mudanças de data no mesmo post viram um bloco, não três linhas soltas —
 * a repetição some e sobra o que mudou.
 */
export type NotificationGroup = {
  key: string
  cardTable: string | null
  cardId: string | null
  clientId: string | null
  title: string | null
  cardType: string | null
  cardNumber: number | null
  deleted: boolean
  url: string | null
  items: NotificationRow[]
  unread: number
  /** Do evento mais recente do grupo — é por ele que a lista ordena. */
  latestAt: string
  /**
   * Presente quando o grupo é uma RODADA de decisões do cliente, e não um
   * card. Aí a caixa deixa de repetir "Cliente aprovou o post" quatro vezes e
   * passa a listar QUAIS posts foram — que é a informação que faltava.
   */
  approvalWave?: { approved: number; rejected: number }
}

/** Decisões que o cliente toma na tela de aprovação. */
export const CLIENT_DECISION_KINDS = ['client_approved', 'crono_approved', 'client_rejected', 'crono_rejected']
export const REJECT_KINDS = ['client_rejected', 'crono_rejected']

export function approvalWaveLabel(w: { approved: number; rejected: number }) {
  const parts: string[] = []
  if (w.approved > 0) parts.push(`aprovou ${w.approved} post${w.approved !== 1 ? 's' : ''}`)
  if (w.rejected > 0) parts.push(`pediu ajuste em ${w.rejected}`)
  return `Cliente ${parts.join(' · ')}`
}

export type NotifBucket = 'hoje' | 'ontem' | 'semana' | 'antes'

const BUCKET_LABEL: Record<NotifBucket, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  semana: 'Esta semana',
  antes: 'Antes',
}

export function bucketLabel(b: NotifBucket) { return BUCKET_LABEL[b] }

export function bucketOf(iso: string, now = new Date()): NotifBucket {
  const d = new Date(iso)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  if (t >= startOfToday) return 'hoje'
  if (t >= startOfToday - 86400000) return 'ontem'
  if (t >= startOfToday - 7 * 86400000) return 'semana'
  return 'antes'
}

export async function fetchNotifications(memberId: string, limit = 120): Promise<NotificationRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('hub_notifications')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit)
  // A tabela pode não existir ainda (migração não rodada) — nesse caso o
  // sininho fica vazio em vez de derrubar o layout inteiro.
  if (error) return []
  return (data || []) as NotificationRow[]
}

/**
 * Contador do sininho. É relido a cada 30 segundos pelo layout — por isso a
 * marcação de lida precisa ser AGUARDADA antes de zerar o número na tela.
 * Sem isso, a releitura chegava antes do UPDATE gravar e o aviso voltava
 * sozinho, dando a impressão de que só entrar no card notificado resolvia.
 */
export async function fetchUnreadCount(memberId: string): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('hub_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .is('read_at', null)
  if (error) return 0
  return count || 0
}

export function groupByCard(rows: NotificationRow[]): NotificationGroup[] {
  const map = new Map<string, NotificationGroup>()
  for (const r of rows) {
    // Sem card (avisos gerais), cada linha é seu próprio grupo — senão todas
    // se fundiriam numa só.
    const key = r.card_id ? `${r.card_table}:${r.card_id}` : `solo:${r.id}`
    const g = map.get(key)
    if (g) {
      g.items.push(r)
      if (!r.read_at) g.unread++
      // As linhas já vêm da mais nova pra mais antiga, então o primeiro item
      // de cada grupo define a posição dele na lista.
    } else {
      map.set(key, {
        key,
        cardTable: r.card_table,
        cardId: r.card_id,
        clientId: r.client_id,
        title: r.title,
        cardType: r.card_type,
        cardNumber: r.card_number,
        deleted: !!r.card_deleted,
        url: r.url,
        items: [r],
        unread: r.read_at ? 0 : 1,
        latestAt: r.created_at,
      })
    }
  }
  return [...map.values()]
}

// Quanto tempo separa duas SESSÕES de aprovação do mesmo cliente. O cliente
// senta e responde tudo em minutos; se ele voltar à noite pra pedir um ajuste,
// isso é outra conversa e merece outra caixa.
const WAVE_GAP_MS = 3 * 60 * 60 * 1000

/**
 * Agrupamento da lista. Duas regras, nesta ordem:
 *
 * 1. Decisão do cliente em lote vira UMA caixa por rodada, listando os posts.
 *    Antes, o cliente aprovar 4 posts gerava 4 caixas iguais dizendo "Cliente
 *    aprovou o post" MAIS a caixa do resumo — cinco linhas pra um fato só, e
 *    nenhuma delas dizia quais posts eram.
 * 2. O resto agrupa por card, como sempre.
 *
 * Decisão isolada (um post só) NÃO vira resumo: ela volta pro card dela, junto
 * com o que mais aconteceu ali — foi o caso do #2 no print, onde a aprovação
 * do cliente e o "Franz moveu de Aprovado para Aguardando" contam a mesma
 * história e precisam ficar lado a lado.
 */
export function groupNotifications(rows: NotificationRow[]): NotificationGroup[] {
  const decisions: NotificationRow[] = []
  const digests: NotificationRow[] = []
  const rest: NotificationRow[] = []
  for (const r of rows) {
    if (CLIENT_DECISION_KINDS.includes(r.kind) && r.client_id) decisions.push(r)
    else if (r.kind === 'approval_digest') digests.push(r)
    else rest.push(r)
  }

  // As linhas já chegam da mais nova pra mais antiga, então basta ir cortando
  // quando o intervalo entre duas passa da janela.
  const byClient = new Map<string, NotificationRow[]>()
  for (const r of decisions) {
    const arr = byClient.get(r.client_id!) || []
    arr.push(r)
    byClient.set(r.client_id!, arr)
  }
  const waves: NotificationRow[][] = []
  for (const list of byClient.values()) {
    let cur: NotificationRow[] = []
    for (const r of list) {
      if (!cur.length) { cur = [r]; continue }
      const prevAt = new Date(cur[cur.length - 1].created_at).getTime()
      if (prevAt - new Date(r.created_at).getTime() <= WAVE_GAP_MS) cur.push(r)
      else { waves.push(cur); cur = [r] }
    }
    if (cur.length) waves.push(cur)
  }

  const out: NotificationGroup[] = []
  for (const w of waves) {
    if (w.length < 2) { rest.push(...w); continue }
    const rejected = w.filter(r => REJECT_KINDS.includes(r.kind)).length
    out.push({
      key: `wave:${w[0].id}`,
      cardTable: null, cardId: null,
      clientId: w[0].client_id,
      title: null, cardType: null, cardNumber: null,
      deleted: false,
      // A caixa toda leva pra aprovações do cliente; cada post da lista tem o
      // link próprio, então dá pra ir direto naquele que interessa.
      url: `/dashboard/aprovacao?client=${w[0].client_id}`,
      items: w,
      unread: w.filter(r => !r.read_at).length,
      latestAt: w[0].created_at,
      approvalWave: { approved: w.length - rejected, rejected },
    })
  }

  // O resumo do cron ("Fiorellato aprovou 4 conteúdos") vira redundante quando
  // as decisões dele já estão na tela — some, em vez de virar uma sexta caixa
  // dizendo a mesma coisa. Sem decisões por perto (o resumo foi pra alguém que
  // não recebeu os avisos por card), ele continua valendo sozinho.
  const digestWindow = 6 * 60 * 60 * 1000
  for (const d of digests) {
    const t = new Date(d.created_at).getTime()
    const coberto = decisions.some(r =>
      r.client_id === d.client_id && Math.abs(new Date(r.created_at).getTime() - t) <= digestWindow)
    if (!coberto) rest.push(d)
  }

  out.push(...groupByCard(rest))
  out.sort((a, b) => b.latestAt.localeCompare(a.latestAt))
  return out
}

export async function markRead(ids: string[]) {
  if (!ids.length) return
  const supabase = createClient()
  const { error } = await supabase.from('hub_notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
  if (error) console.error('[notificações] não consegui marcar como lida:', error)
}

// Falhar aqui em silêncio é o pior caso: o contador volta sozinho na próxima
// leitura e a pessoa acha que o hub está ignorando ela.
export async function markAllRead(memberId: string) {
  if (!memberId) return
  const supabase = createClient()
  const { error } = await supabase.from('hub_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('read_at', null)
  if (error) console.error('[notificações] não consegui marcar tudo como lido:', error)
}

/** Rótulos curtos por tipo de evento, pro filtro do topo. */
export const KIND_GROUPS: { key: string; label: string; match: (kind: string) => boolean }[] = [
  { key: 'todos',     label: 'Tudo',       match: () => true },
  { key: 'mention',   label: 'Menções',    match: k => k === 'mention' || k === 'commented' },
  { key: 'approval',  label: 'Aprovações', match: k => k.includes('approv') || k.includes('reject') || k === 'approval_digest' },
  { key: 'date',      label: 'Datas',      match: k => k.includes('date') || k === 'status_changed' || k === 'overdue' },
]
