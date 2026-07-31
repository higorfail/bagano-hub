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
  body: string
  url: string | null
  read_at: string | null
  created_at: string
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
  url: string | null
  items: NotificationRow[]
  unread: number
  /** Do evento mais recente do grupo — é por ele que a lista ordena. */
  latestAt: string
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
    .from('notifications')
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
 * Só a contagem, pro contador do sininho. Separado do fetch completo porque o
 * contador precisa estar certo antes de alguém abrir o painel — senão o
 * sininho fica sem número até ser clicado, que é justamente o contrário do
 * que ele serve.
 */
export async function fetchUnreadCount(memberId: string): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('notifications')
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
        url: r.url,
        items: [r],
        unread: r.read_at ? 0 : 1,
        latestAt: r.created_at,
      })
    }
  }
  return [...map.values()]
}

export async function markRead(ids: string[]) {
  if (!ids.length) return
  const supabase = createClient()
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
}

export async function markAllRead(memberId: string) {
  const supabase = createClient()
  await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('read_at', null)
}

/** Rótulos curtos por tipo de evento, pro filtro do topo. */
export const KIND_GROUPS: { key: string; label: string; match: (kind: string) => boolean }[] = [
  { key: 'todos',     label: 'Tudo',       match: () => true },
  { key: 'mention',   label: 'Menções',    match: k => k === 'mention' || k === 'commented' },
  { key: 'approval',  label: 'Aprovações', match: k => k.includes('approv') || k.includes('reject') },
  { key: 'date',      label: 'Datas',      match: k => k.includes('date') || k === 'status_changed' },
]
