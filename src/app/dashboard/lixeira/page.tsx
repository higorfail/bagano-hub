'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { restoreFromTrash, deleteFromTrash, type TrashItem, type TrashItemType } from '@/lib/trash'
import { FileText, User, Package, CalendarHeart, LayoutList, RotateCcw, Trash2, Inbox } from 'lucide-react'
import { useToast } from '@/lib/ToastContext'

const TYPE_META: Record<TrashItemType, { label: string; Icon: React.ElementType; color: string }> = {
  post:         { label: 'Post',          Icon: FileText,      color: 'var(--ds-info-text)' },
  member:       { label: 'Membro',        Icon: User,          color: 'var(--ds-purple-text)' },
  material:     { label: 'Material',      Icon: Package,       color: 'var(--ds-warn-text)' },
  special_date: { label: 'Data especial', Icon: CalendarHeart, color: 'var(--ds-success-text)' },
  extra:        { label: 'Extra',         Icon: LayoutList,    color: 'var(--ds-error-text)' },
}

function daysLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

function relativeDate(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins}min`
  if (hours < 24) return `há ${hours}h`
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

export default function LixeiraPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<TrashItem[]>([])
  const [clients, setClients] = useState<{ id: string; name: string; color_hex: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TrashItemType | 'all'>('all')
  const [acting, setActing] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: trashData }, { data: clientsData }] = await Promise.all([
      supabase.from('trash').select('*').order('deleted_at', { ascending: false }),
      supabase.from('clients').select('id, name, color_hex'),
    ])
    setItems((trashData as TrashItem[]) || [])
    setClients(clientsData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function restore(item: TrashItem) {
    setActing(item.id)
    try {
      await restoreFromTrash(item)
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast(`"${item.label}" restaurado!`)
    } catch {
      toast('Erro ao restaurar item')
    }
    setActing(null)
  }

  async function permDelete(item: TrashItem) {
    setActing(item.id)
    await deleteFromTrash(item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    toast('Item excluído permanentemente')
    setActing(null)
  }

  async function clearAll() {
    const supabase = createClient()
    await supabase.from('trash').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setItems([])
    setConfirmClear(false)
    toast('Lixeira esvaziada')
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.item_type === filter)
  const types = [...new Set(items.map(i => i.item_type))] as TrashItemType[]
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-3xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Lixeira</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {items.length === 0 ? 'Vazia' : `${items.length} ${items.length === 1 ? 'item' : 'itens'} · expira em 30 dias`}
            </p>
          </div>
          {items.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-muted)]">Esvaziar tudo?</span>
                <button onClick={() => setConfirmClear(false)} className="px-3 py-1.5 rounded-xl text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]">Cancelar</button>
                <button onClick={clearAll} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
                  Esvaziar
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors px-3 py-2 rounded-xl hover:bg-[var(--color-bg-subtle)]">
                Esvaziar lixeira
              </button>
            )
          )}
        </div>

        {items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-subtle)] flex items-center justify-center">
              <Inbox size={28} strokeWidth={1.5} className="text-[var(--color-text-faint)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">Lixeira vazia</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">Itens excluídos aparecem aqui por 30 dias</p>
            </div>
          </div>
        ) : (
          <>
            {/* Type filter */}
            {types.length > 1 && (
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filter === 'all' ? 'bg-[var(--color-text-primary)] text-[var(--color-brand-fg)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)]'}`}
                >
                  Todos ({items.length})
                </button>
                {types.map(t => {
                  const meta = TYPE_META[t]
                  const count = items.filter(i => i.item_type === t).length
                  return (
                    <button
                      key={t}
                      onClick={() => setFilter(t)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filter === t ? 'bg-[var(--color-text-primary)] text-[var(--color-brand-fg)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)]'}`}
                    >
                      {meta.label}s ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {/* Items */}
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border)] shadow-card">
              {filtered.map(item => {
                const meta = TYPE_META[item.item_type] || TYPE_META.post
                const { Icon } = meta
                const days = daysLeft(item.expires_at)
                const isUrgent = days <= 3
                const isActing = acting === item.id
                const data = (item.item_data || {}) as Record<string, any>
                const client = data.client_id ? clientMap[data.client_id] : null
                const images: string[] = Array.isArray(data.reference_images) ? data.reference_images : []
                return (
                  <div key={item.id} className="flex items-start gap-4 px-5 py-4 group hover:bg-[var(--color-bg-subtle)] transition-colors">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'var(--color-bg-subtle)' }}>
                      <Icon size={16} style={{ color: meta.color }} strokeWidth={1.75} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{item.label}</p>
                        {data.post_number != null && <span className="text-[11px] font-bold text-[var(--color-text-faint)]">#{data.post_number}</span>}
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}>{meta.label}</span>
                        {client && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white flex items-center gap-1" style={{ background: client.color_hex }}>
                            {client.name}
                          </span>
                        )}
                        {data.post_type && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">{data.post_type}</span>}
                      </div>

                      {/* Meta: quem/quando/expira */}
                      <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-[var(--color-text-muted)]">
                        <span>Excluído {item.deleted_by ? <>por <span className="font-semibold text-[var(--color-text-secondary)]">{item.deleted_by}</span></> : ''} · {relativeDate(item.deleted_at)}</span>
                        {data.scheduled_date && <span className="text-[var(--color-text-faint)]">· data {new Date(data.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>}
                        <span className="font-medium" style={{ color: isUrgent ? 'var(--ds-error-accent)' : 'var(--color-text-faint)' }}>
                          · {days === 0 ? 'expira hoje' : `expira em ${days}d`}
                        </span>
                      </div>

                      {/* Prévia da copy/legenda */}
                      {(data.copy || data.legenda || data.briefing) && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-1.5 line-clamp-2 leading-relaxed">{data.briefing || data.copy || data.legenda}</p>
                      )}

                      {/* Imagens que tinha */}
                      {images.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {images.slice(0, 8).map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="w-11 h-11 rounded-lg overflow-hidden border border-[var(--color-border)] flex-shrink-0 hover:opacity-80 transition-opacity">
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </a>
                          ))}
                          {images.length > 8 && <span className="text-[10px] text-[var(--color-text-faint)]">+{images.length - 8}</span>}
                        </div>
                      )}
                      {data.drive_url && (
                        <a href={data.drive_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5" style={{ color: 'var(--ds-info-text)' }}>
                          📦 Conteúdo no Drive
                        </a>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                      <button
                        onClick={() => restore(item)}
                        disabled={isActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                        style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}
                      >
                        <RotateCcw size={11} strokeWidth={2.5} />
                        {isActing ? '...' : 'Restaurar'}
                      </button>
                      <button
                        onClick={() => permDelete(item)}
                        disabled={isActing}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg-page)] transition-colors disabled:opacity-50"
                        title="Excluir permanentemente"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-[var(--color-text-faint)] text-center mt-4">
              Itens na lixeira são excluídos automaticamente após 30 dias
            </p>
          </>
        )}
      </div>
    </div>
  )
}
