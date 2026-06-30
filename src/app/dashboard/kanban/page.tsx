'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import PostCard from '@/components/PostCard'
import { ChevronDown, ChevronRight } from 'lucide-react'

type Post = {
  id: string; post_number: number; title: string; post_type: string
  status: string; scheduled_date: string; client_id: string
  month: number; year: number; approval_status: string
  approval_comment: string; drive_url: string; funil: string
  copy: string; campaign_type: string
}
type Client = { id: string; name: string; color_hex: string }

const COLUMNS = [
  { key: 'crono_feito',          label: 'Crono Feito',  color: '#10B981', virtual: true },
  { key: 'aguardando_aprovacao', label: 'Com cliente',  color: '#EC4899' },
  { key: 'producao',             label: 'Em Produção',  color: '#F59E0B' },
  { key: 'revisao_interna',      label: 'Revisão',      color: '#8B5CF6' },
  { key: 'aprovado',             label: 'Aprovado',     color: '#3B82F6' },
  { key: 'agendado',             label: 'Agendado',     color: '#14B8A6' },
  { key: 'publicado',            label: 'Publicado',    color: '#22C55E' },
]

const TYPE_LABEL: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories',
}
const TYPE_ACCENT: Record<string, string> = {
  reels: '#ef4444', carrossel: '#3b82f6', post: '#f59e0b',
  story: '#8b5cf6', carrossel_stories: '#6366f1',
}
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']


export default function KanbanPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear] = useState(new Date().getFullYear())
  const [showPostCard, setShowPostCard] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [cronoStatuses, setCronoStatuses] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const dragCounters = useRef<Record<string, number>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: clientData }, { data: postData }, { data: cronoData }] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex').eq('status', 'active'),
        supabase.from('schedules')
          .select('id, post_number, title, post_type, status, scheduled_date, client_id, month, year, approval_status, approval_comment, drive_url, funil, copy, campaign_type')
          .eq('month', selectedMonth).eq('year', selectedYear).order('post_number'),
        supabase.from('cronograma_status')
          .select('client_id, month, year, status')
          .eq('month', selectedMonth).eq('year', selectedYear),
      ])
      setClients(clientData || [])
      setPosts(postData || [])
      const map: Record<string, string> = {}
      ;(cronoData || []).forEach(cs => { map[`${cs.client_id}-${cs.month}-${cs.year}`] = cs.status })
      setCronoStatuses(map)
      setLoading(false)
    }
    load()
  }, [selectedMonth, selectedYear])

  async function movePost(postId: string, toColKey: string) {
    const dbStatus = toColKey === 'crono_feito' ? 'producao' : toColKey
    await createClient().from('schedules').update({ status: dbStatus }).eq('id', postId)
    setPosts(p => p.map(post => post.id === postId ? { ...post, status: dbStatus } : post))
  }

  function getColPosts(colKey: string): Post[] {
    if (colKey === 'crono_feito') {
      return posts.filter(p => {
        const key = `${p.client_id}-${p.month}-${p.year}`
        return p.status === 'producao' && cronoStatuses[key] === 'finalizado'
      })
    }
    if (colKey === 'producao') {
      return posts.filter(p => {
        const key = `${p.client_id}-${p.month}-${p.year}`
        return p.status === 'producao' && cronoStatuses[key] !== 'finalizado'
      })
    }
    return posts.filter(p => p.status === colKey)
  }

  function groupByClient(colPosts: Post[]): [string, Post[]][] {
    const map: Record<string, Post[]> = {}
    for (const p of colPosts) {
      if (!map[p.client_id]) map[p.client_id] = []
      map[p.client_id].push(p)
    }
    return Object.entries(map)
  }

  function toggleCollapse(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function openPostCard(post: Post) {
    setEditingPostId(post.id)
    setEditingClientId(post.client_id)
    setShowPostCard(true)
  }

  function getClient(id: string) { return clients.find(c => c.id === id) }

  async function reloadPosts() {
    const { data } = await createClient()
      .from('schedules')
      .select('id, post_number, title, post_type, status, scheduled_date, client_id, month, year, approval_status, approval_comment, drive_url, funil, copy, campaign_type')
      .eq('month', selectedMonth).eq('year', selectedYear).order('post_number')
    setPosts(data || [])
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</div>

  const totalPosts = posts.length
  const publishedPosts = posts.filter(p => p.status === 'publicado').length
  const pendingApproval = posts.filter(p => p.approval_status === 'não aprovado').length
  const cronoFeitoCount = getColPosts('crono_feito').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-[var(--color-text-primary)] font-semibold text-lg">Kanban</h1>
            <p className="text-[var(--color-text-muted)] text-xs mt-0.5">{publishedPosts}/{totalPosts} publicados · {MONTHS_FULL[selectedMonth - 1]}</p>
          </div>
          {cronoFeitoCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border" style={{ background: 'var(--ds-success-bg)', borderColor: 'var(--ds-success-border)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--ds-success-text)' }}>✓ {cronoFeitoCount} {cronoFeitoCount === 1 ? 'crono finalizado' : 'cronos finalizados'}</span>
            </div>
          )}
          {pendingApproval > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border" style={{ background: 'var(--ds-error-bg)', borderColor: 'var(--ds-error-border)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--ds-error-text)' }}>✗ {pendingApproval} não aprovado{pendingApproval > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedMonth(m => m === 1 ? 12 : m - 1)} className="w-8 h-8 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">‹</button>
          <span className="text-sm font-medium text-[var(--color-text-primary)] w-28 text-center">{MONTHS_FULL[selectedMonth - 1]} {selectedYear}</span>
          <button onClick={() => setSelectedMonth(m => m === 12 ? 1 : m + 1)} className="w-8 h-8 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">›</button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-3 h-full min-w-max">
          {COLUMNS.map(col => {
            const colPosts = getColPosts(col.key)
            const groups = groupByClient(colPosts)
            const isDragOver = dragOver === col.key
            return (
              <div
                key={col.key}
                className={`flex flex-col w-[268px] rounded-2xl overflow-hidden transition-all ${isDragOver ? 'ring-2 ring-offset-1' : ''}`}
                style={isDragOver ? { outline: `2px solid ${col.color}`, outlineOffset: 1 } : {}}
                onDragEnter={() => {
                  dragCounters.current[col.key] = (dragCounters.current[col.key] || 0) + 1
                  setDragOver(col.key)
                }}
                onDragLeave={() => {
                  dragCounters.current[col.key] = (dragCounters.current[col.key] || 1) - 1
                  if (dragCounters.current[col.key] <= 0) { dragCounters.current[col.key] = 0; setDragOver(null) }
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragging) movePost(dragging, col.key)
                  dragCounters.current[col.key] = 0
                  setDragging(null); setDragOver(null)
                }}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                    <span className="text-xs font-semibold text-[var(--color-text-primary)]">{col.label}</span>
                    {col.virtual && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide" style={{ background: col.color + '22', color: col.color }}>auto</span>}
                  </div>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-card)] rounded-full w-5 h-5 flex items-center justify-center border border-[var(--color-border)]">
                    {colPosts.length}
                  </span>
                </div>

                {/* Cards area */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-1.5">
                  {colPosts.length === 0 && (
                    <div className={`flex items-center justify-center h-20 border-2 border-dashed rounded-xl mx-1 transition-colors ${isDragOver ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-[var(--color-border)]'}`}>
                      <p className={`text-[10px] font-medium ${isDragOver ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-faint)]'}`}>
                        {isDragOver ? 'Solte aqui' : '—'}
                      </p>
                    </div>
                  )}

                  {groups.map(([clientId, clientPosts]) => {
                    const client = getClient(clientId)
                    const groupKey = `${col.key}:${clientId}`
                    const isCollapsed = !expanded.has(groupKey)
                    const byType = clientPosts.reduce((acc, p) => {
                      const t = TYPE_LABEL[p.post_type] || p.post_type
                      acc[t] = (acc[t] || 0) + 1
                      return acc
                    }, {} as Record<string, number>)
                    return (
                      <div key={clientId} className="flex flex-col gap-1">
                        {/* Client group header */}
                        <button
                          onClick={() => toggleCollapse(groupKey)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-[var(--color-bg-card)] transition-colors w-full text-left group"
                        >
                          <div className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: client?.color_hex || '#A8A59E' }}>
                            {client?.name?.slice(0, 1)}
                          </div>
                          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] flex-1 truncate">{client?.name}</span>
                          <span className="text-[10px] text-[var(--color-text-faint)]">{clientPosts.length}</span>
                          {isCollapsed
                            ? <ChevronRight size={11} className="text-[var(--color-text-faint)] flex-shrink-0" />
                            : <ChevronDown size={11} className="text-[var(--color-text-faint)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          }
                        </button>

                        {/* Collapsed summary */}
                        {isCollapsed && (
                          <div className="mx-1 px-3 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex flex-wrap gap-1">
                            {Object.entries(byType).map(([type, count]) => (
                              <span key={type} className="text-[10px] font-medium text-[var(--color-text-muted)]">
                                {count}× {type}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Individual cards */}
                        {!isCollapsed && clientPosts.map(post => {
                          const isBeingDragged = dragging === post.id
                          const isRejected = post.approval_status === 'não aprovado'
                          const isApproved = post.approval_status === 'aprovado'
                          const typeAccent = TYPE_ACCENT[post.post_type] || 'var(--color-border)'
                          return (
                            <div
                              key={post.id}
                              draggable
                              onDragStart={e => { setDragging(post.id); e.dataTransfer.effectAllowed = 'move' }}
                              onDragEnd={() => { setDragging(null); setDragOver(null); dragCounters.current = {} }}
                              onClick={() => openPostCard(post)}
                              className={`mx-1 bg-[var(--color-bg-card)] rounded-2xl overflow-hidden flex flex-col cursor-pointer select-none transition-all
                                ${isBeingDragged ? 'opacity-40 scale-95 shadow-xl' : 'hover:shadow-sm hover:border-[var(--color-border-hover)]'}
                                ${isRejected ? 'border border-[var(--ds-error-border)]' : 'border border-[var(--color-border)]'}`}
                            >
                              {/* Type accent bar */}
                              <div className="h-[3px] flex-shrink-0" style={{ background: typeAccent }} />

                              <div className="p-3 flex flex-col gap-2">
                                {/* Rejection banner */}
                                {isRejected && (
                                  <div className="rounded-lg px-2 py-1" style={{ background: 'var(--ds-error-bg)' }}>
                                    <p className="text-[10px] font-semibold" style={{ color: 'var(--ds-error-text)' }}>✗ Não aprovado pelo cliente</p>
                                    {post.approval_comment && (
                                      <p className="text-[10px] italic mt-0.5 leading-snug" style={{ color: 'var(--ds-error-text)' }}>"{post.approval_comment}"</p>
                                    )}
                                  </div>
                                )}

                                {/* Client + number row */}
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] font-medium text-[var(--color-text-muted)] truncate max-w-[140px]">{client?.name}</span>
                                  <span className="text-[10px] font-bold text-[var(--color-text-faint)] flex-shrink-0">#{post.post_number}</span>
                                </div>

                                {/* Title */}
                                <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2">{post.title}</p>

                                {/* Copy preview */}
                                {post.copy && (
                                  <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed line-clamp-2">{post.copy}</p>
                                )}

                                {/* Footer */}
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--color-border)]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: typeAccent + '22', color: typeAccent }}>
                                      {TYPE_LABEL[post.post_type] || post.post_type}
                                    </span>
                                    {isApproved && !isRejected && (
                                      <span className="text-[10px] font-semibold" style={{ color: 'var(--ds-success-text)' }}>✓</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {post.scheduled_date && (
                                      <span className="text-[10px] text-[var(--color-text-muted)]">
                                        {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* PostCard modal */}
      {showPostCard && editingPostId && editingClientId && (
        <PostCard
          postId={editingPostId}
          clientId={editingClientId}
          clientColor={getClient(editingClientId)?.color_hex}
          clientName={getClient(editingClientId)?.name}
          month={selectedMonth}
          year={selectedYear}
          onClose={() => { setShowPostCard(false); setEditingPostId(null); setEditingClientId(null) }}
          onSaved={reloadPosts}
          onDeleted={reloadPosts}
        />
      )}
    </div>
  )
}
