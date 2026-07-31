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
  carrossel_stories: { label: 'Carrossel/Stories', color: '#6366f1' },
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
 * Contador do sininho. Fica simples de novo porque o painel marca tudo como
 * lido AO FECHAR: o número some sozinho depois da olhada, sem precisar de um
 * estado separado de "visto" que nunca se limpava.
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

export async function markRead(ids: string[]) {
  if (!ids.length) return
  const supabase = createClient()
  await supabase.from('hub_notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
}

export async function markAllRead(memberId: string) {
  const supabase = createClient()
  await supabase.from('hub_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('read_at', null)
}

/** Rótulos curtos por tipo de evento, pro filtro do topo. */
export const KIND_GROUPS: { key: string; label: string; match: (kind: string) => boolean }[] = [
  { key: 'todos',     label: 'Tudo',       match: () => true },
  { key: 'mention',   label: 'Menções',    match: k => k === 'mention' || k === 'commented' },
  { key: 'approval',  label: 'Aprovações', match: k => k.includes('approv') || k.includes('reject') || k === 'approval_digest' },
  { key: 'date',      label: 'Datas',      match: k => k.includes('date') || k === 'status_changed' || k === 'overdue' },
]
