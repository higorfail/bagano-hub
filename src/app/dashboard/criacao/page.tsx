'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import { useUser } from '@/lib/UserContext'
import { useToast } from '@/lib/ToastContext'
import { CheckCircle2, Loader2, Pencil, X, Check, Filter, ChevronDown } from 'lucide-react'
import PostCard from '@/components/PostCard'

const POST_TYPES: Record<string, { label: string; emoji: string; color: string }> = {
  carrossel:         { label: 'Carrossel',         emoji: '🎠', color: '#3b82f6' },
  reels:             { label: 'Reels',             emoji: '🎬', color: '#ef4444' },
  post:              { label: 'Post',              emoji: '🖼️', color: '#f59e0b' },
  story:             { label: 'Story',             emoji: '📸', color: '#8b5cf6' },
  carrossel_stories: { label: 'Carrossel/Stories', emoji: '🎞️', color: '#6366f1' },
}

const POST_TYPE_ORDER = ['carrossel', 'reels', 'post', 'story', 'carrossel_stories']

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

type Post = {
  id: string
  title: string
  post_type: string
  scheduled_date: string | null
  briefing: string | null
  copy: string | null
  funil: string | null
  post_number: number
  month: number
  year: number
  client_id: string
}

type CronoStatus = {
  client_id: string
  month: number
  year: number
  production_note: string | null
}

type Client = { id: string; name: string; color_hex: string }
type Member = { id: string; name: string; role: string; color?: string }

type Extra = {
  id: string
  title: string
  type: string
  due_date: string | null
  client_id: string | null
  description: string | null
  assigned_members: string[] | null
}

type AgendaEntry = { client_id: string; member_ids: string[] | null }

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatDate(d: string | null) {
  if (!d) return null
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

export default function CriacaoPage() {
  useEffect(() => { document.title = 'Criação · Bagano Hub' }, [])

  const supabase = createClient()
  const { currentMember } = useUser()
  const { toast } = useToast()
  const hasInitialized = useRef(false)

  const [clients,      setClients]      = useState<Client[]>([])
  const [members,      setMembers]      = useState<Member[]>([])
  const [posts,        setPosts]        = useState<Post[]>([])
  const [cronoNotes,   setCronoNotes]   = useState<CronoStatus[]>([])
  const [extras,       setExtras]       = useState<Extra[]>([])
  const [agendaEntries,setAgendaEntries]= useState<AgendaEntry[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(false)

  const [filterClient, setFilterClient] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [filterMember, setFilterMember] = useState('')

  const [editingNote,      setEditingNote]      = useState<string | null>(null)
  const [noteText,         setNoteText]         = useState('')
  const [savingNote,       setSavingNote]       = useState<string | null>(null)
  const [markingDone,      setMarkingDone]      = useState<string | null>(null)
  const [fadingPosts,      setFadingPosts]      = useState<Set<string>>(new Set())
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set())
  const [showPostCard, setShowPostCard] = useState(false)
  const [editingPostId,setEditingPostId]= useState<string | null>(null)
  const [editingPostCtx, setEditingPostCtx] = useState<{ clientId: string; clientName: string; clientColor: string; month: number; year: number } | null>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const now   = new Date()
      const year  = now.getFullYear()
      // agenda_criacao for the past 4 weeks + next 4 weeks
      const from  = new Date(now); from.setDate(from.getDate() - 28)
      const to    = new Date(now); to.setDate(to.getDate() + 28)
      const fromStr = from.toISOString().slice(0, 10)
      const toStr   = to.toISOString().slice(0, 10)

      const [{ data: cl, error: e1 }, { data: mb, error: e2 }, { data: po, error: e3 }, { data: cs }, { data: ex }, { data: ag }] = await Promise.all([
        supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name'),
        supabase.from('team_members').select('id, name, role, color').order('name'),
        supabase.from('schedules')
          .select('id, title, post_type, scheduled_date, briefing, copy, funil, post_number, month, year, client_id')
          .eq('status', 'producao')
          .order('scheduled_date', { ascending: true, nullsFirst: false }),
        supabase.from('cronograma_status')
          .select('client_id, month, year, production_note')
          .gte('year', year - 1),
        supabase.from('extras')
          .select('id, title, type, due_date, client_id, description, assigned_members')
          .neq('status', 'done')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(50),
        supabase.from('agenda_criacao')
          .select('client_id, member_ids')
          .gte('week_start', fromStr)
          .lte('week_start', toStr),
      ])

      if (e1 || e2 || e3) { setLoadError(true); setLoading(false); return }

      setClients(cl || [])
      setMembers(mb || [])
      setPosts(po || [])
      setCronoNotes(cs || [])
      setExtras(ex || [])
      setAgendaEntries(ag || [])

      // On first load only: collapse all clients except the first
      if (!hasInitialized.current) {
        hasInitialized.current = true
        const orderedIds = [...new Set([
          ...(po || []).map(p => p.client_id),
          ...(ex || []).filter(e => e.client_id).map(e => e.client_id!),
        ])]
        if (orderedIds.length > 1) {
          setCollapsedClients(new Set(orderedIds.slice(1)))
        }
      }
    } catch {
      setLoadError(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-filter to logged-in member so each person sees only their work by default
  useEffect(() => {
    if (currentMember?.id) setFilterMember(currentMember.id)
  }, [currentMember?.id])

  const clientMap  = Object.fromEntries((clients || []).map(c => [c.id, c]))
  const memberMap  = Object.fromEntries((members || []).map(m => [m.id, m]))

  function cronoKey(clientId: string, month: number, year: number) {
    return `${clientId}-${month}-${year}`
  }

  function getNoteForClient(clientId: string, month: number, year: number) {
    return cronoNotes.find(n => n.client_id === clientId && n.month === month && n.year === year)?.production_note || null
  }

  // For member filter on posts: check if member is assigned to that client in agenda_criacao
  function clientHasMember(clientId: string, memberId: string) {
    return agendaEntries.some(e => e.client_id === clientId && (e.member_ids || []).includes(memberId))
  }

  async function saveNote(clientId: string, month: number, year: number) {
    const key = cronoKey(clientId, month, year)
    setSavingNote(key)
    await supabase.from('cronograma_status')
      .upsert({ client_id: clientId, month, year, production_note: noteText || null }, { onConflict: 'client_id,month,year' })
    setCronoNotes(prev => {
      const exists = prev.find(n => n.client_id === clientId && n.month === month && n.year === year)
      if (exists) return prev.map(n => n.client_id === clientId && n.month === month && n.year === year ? { ...n, production_note: noteText || null } : n)
      return [...prev, { client_id: clientId, month, year, production_note: noteText || null }]
    })
    setEditingNote(null)
    setSavingNote(null)
    toast('Nota salva!')
  }

  function openPost(post: Post) {
    const client = clientMap[post.client_id]
    setEditingPostId(post.id)
    setEditingPostCtx({ clientId: post.client_id, clientName: client?.name || '', clientColor: client?.color_hex || '', month: post.month, year: post.year })
    setShowPostCard(true)
  }

  function toggleCollapse(clientId: string) {
    setCollapsedClients(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId)
      return next
    })
  }

  async function markDone(postId: string) {
    setMarkingDone(postId)
    setFadingPosts(prev => new Set(prev).add(postId))
    const post = posts.find(p => p.id === postId)
    await supabase.from('schedules').update({ status: 'revisao_interna' }).eq('id', postId)
    if (post) {
      await logActivity({
        tableName: 'schedules', recordId: postId, clientId: post.client_id,
        action: 'revisao_interna',
        description: `"${post.title || 'Post'}" enviado para revisão interna`,
      })
    }
    setTimeout(() => {
      setPosts(prev => prev.filter(p => p.id !== postId))
      setFadingPosts(prev => { const next = new Set(prev); next.delete(postId); return next })
      toast('Movido para revisão interna!')
      setMarkingDone(null)
    }, 350)
  }

  // Apply post filters
  // Only use agenda-based filter if the member actually has agenda entries —
  // if they have none (e.g. agenda not filled yet), show all posts instead of hiding everything.
  const memberHasAnyAgenda = filterMember
    ? agendaEntries.some(e => (e.member_ids || []).includes(filterMember))
    : false

  const filteredPosts = posts.filter(p => {
    if (filterClient && p.client_id !== filterClient) return false
    if (filterType   && p.post_type !== filterType)   return false
    if (filterMember && memberHasAnyAgenda && !clientHasMember(p.client_id, filterMember)) return false
    return true
  })

  // Apply extra filters
  const filteredExtras = extras.filter(e => {
    if (filterClient && e.client_id !== filterClient) return false
    if (filterMember && !(e.assigned_members || []).includes(filterMember)) return false
    return true
  })

  // Group filtered posts by client+month+year
  type GroupKey = { clientId: string; month: number; year: number; posts: Post[] }
  const groups: GroupKey[] = []
  const seen = new Set<string>()
  filteredPosts.forEach(p => {
    const k = cronoKey(p.client_id, p.month, p.year)
    if (!seen.has(k)) { seen.add(k); groups.push({ clientId: p.client_id, month: p.month, year: p.year, posts: [] }) }
    groups[groups.findIndex(g => cronoKey(g.clientId, g.month, g.year) === k)].posts.push(p)
  })

  // Group extras by client
  const extrasByClient: Record<string, Extra[]> = {}
  filteredExtras.forEach(e => {
    const cid = e.client_id || '__sem_cliente__'
    if (!extrasByClient[cid]) extrasByClient[cid] = []
    extrasByClient[cid].push(e)
  })

  // All client IDs shown (union of posts + extras)
  const activeClientIds = [...new Set([
    ...groups.map(g => g.clientId),
    ...filteredExtras.filter(e => e.client_id).map(e => e.client_id!),
  ])]

  // "Limpar" só aparece quando o usuário aplicou filtro além do padrão (membro logado)
  const hasFilter = !!(filterClient || filterType || (filterMember && filterMember !== currentMember?.id))
  const totalPosts  = filteredPosts.length
  const totalExtras = filteredExtras.length

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-primary)] rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <p className="text-sm text-[var(--color-text-muted)]">Não foi possível carregar a página de criação.</p>
      <button onClick={() => { setLoading(true); load() }}
        className="text-xs px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors">
        Tentar novamente
      </button>
    </div>
  )

  return (
    <>
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Criação</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {totalPosts === 0 && totalExtras === 0
                ? 'Tudo em dia — nada para criar agora'
                : [totalPosts > 0 && `${totalPosts} post${totalPosts !== 1 ? 's' : ''} para criar`, totalExtras > 0 && `${totalExtras} extra${totalExtras !== 1 ? 's' : ''} pendente${totalExtras !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* Filters */}
          {(totalPosts > 0 || totalExtras > 0) && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />

              {/* Client */}
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-1.5 text-[var(--color-text-secondary)] outline-none cursor-pointer">
                <option value="">Todos os clientes</option>
                {clients.filter(c => posts.some(p => p.client_id === c.id) || extras.some(e => e.client_id === c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Post type */}
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-1.5 text-[var(--color-text-secondary)] outline-none cursor-pointer">
                <option value="">Todos os tipos</option>
                {POST_TYPE_ORDER.map(t => (
                  <option key={t} value={t}>{POST_TYPES[t]?.emoji} {POST_TYPES[t]?.label}</option>
                ))}
              </select>

              {/* Member */}
              <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
                className="text-xs rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-1.5 text-[var(--color-text-secondary)] outline-none cursor-pointer">
                <option value="">Toda a equipe</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              {hasFilter && (
                <button onClick={() => { setFilterClient(''); setFilterType(''); setFilterMember('') }}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Empty state */}
        {totalPosts === 0 && totalExtras === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-3xl shadow-sm">⚡</div>
            <div>
              <p className="text-[var(--color-text-primary)] font-semibold">Nada para criar agora</p>
              <p className="text-[var(--color-text-muted)] text-sm mt-1 max-w-xs">Quando o cliente aprovar o cronograma, os posts aparecem aqui para produção.</p>
            </div>
          </div>
        )}

        {/* Filtered / member-has-no-work empty state */}
        {activeClientIds.length === 0 && (posts.length > 0 || extras.length > 0) && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-2xl shadow-sm">🎉</div>
            <div>
              <p className="text-[var(--color-text-primary)] font-semibold">
                {filterMember === currentMember?.id && !filterClient && !filterType
                  ? 'Nenhum post atribuído a você'
                  : 'Nenhum resultado'}
              </p>
              <p className="text-[var(--color-text-muted)] text-sm mt-1">
                {filterMember === currentMember?.id && !filterClient && !filterType
                  ? 'Use o filtro de membro para ver o trabalho da equipe.'
                  : 'Ajuste os filtros acima.'}
              </p>
            </div>
          </div>
        )}

        {/* One block per client */}
        {activeClientIds.map(clientId => {
          const client = clientMap[clientId]
          if (!client) return null

          const clientGroups = groups.filter(g => g.clientId === clientId)
          const clientExtras = extrasByClient[clientId] || []
          if (clientGroups.length === 0 && clientExtras.length === 0) return null

          const totalForClient = clientGroups.reduce((s, g) => s + g.posts.length, 0)

          const isCollapsed = collapsedClients.has(clientId)

          return (
            <section key={clientId} className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">

              {/* Client header — click to collapse */}
              <button
                onClick={() => toggleCollapse(clientId)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--color-bg-subtle)]"
                style={{ borderLeft: `4px solid ${client.color_hex}`, borderBottom: isCollapsed ? 'none' : '1px solid var(--color-border)' }}>
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: client.color_hex }}>
                  {getInitials(client.name)}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">{client.name}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    {[
                      clientGroups.length > 0 && clientGroups.map(g => MONTHS[g.month - 1]).join(', '),
                      totalForClient > 0 && `${totalForClient} post${totalForClient !== 1 ? 's' : ''}`,
                      clientExtras.length > 0 && `${clientExtras.length} extra${clientExtras.length !== 1 ? 's' : ''}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>

                {/* Members assigned to this client in agenda */}
                {(() => {
                  const assigned = agendaEntries
                    .filter(e => e.client_id === clientId)
                    .flatMap(e => e.member_ids || [])
                  const unique = [...new Set(assigned)]
                  if (!unique.length) return null
                  return (
                    <div className="flex -space-x-1.5">
                      {unique.slice(0, 4).map(mid => {
                        const m = memberMap[mid]
                        if (!m) return null
                        return (
                          <div key={mid} title={m.name}
                            className="w-6 h-6 rounded-full border-2 border-[var(--color-bg-card)] flex items-center justify-center text-white text-[9px] font-bold"
                            style={{ background: m.color || '#6b7280' }}>
                            {getInitials(m.name)}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                <ChevronDown
                  size={15}
                  className="flex-shrink-0 text-[var(--color-text-muted)] transition-transform duration-200"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                />
              </button>

              {/* Collapsed body */}
              {!isCollapsed && (
              <>

              {/* Cronograma groups (note + posts) */}
              {clientGroups.map(group => {
                const key = cronoKey(group.clientId, group.month, group.year)
                const note = getNoteForClient(group.clientId, group.month, group.year)
                const isEditing = editingNote === key
                const isSaving = savingNote === key

                return (
                  <div key={key}>
                    {/* Production note — only shown when there is content or being edited */}
                    {(note || isEditing) ? (
                      <div className="px-5 py-3 border-b border-[var(--color-border)]"
                        style={{ background: 'var(--ds-caution-bg)' }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ds-caution-text)' }}>
                            📝 Nota · {MONTHS[group.month - 1]} {group.year}
                          </span>
                          {!isEditing && (
                            <button
                              onClick={() => { setNoteText(note || ''); setEditingNote(key) }}
                              className="flex items-center gap-1 text-[11px] font-medium transition-colors"
                              style={{ color: 'var(--ds-caution-text)' }}>
                              <Pencil size={11} /> Editar
                            </button>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              autoFocus
                              value={noteText}
                              onChange={e => setNoteText(e.target.value)}
                              placeholder="Ex: Usar footage do boat show, paleta quente, já temos imagens na pasta Drive."
                              className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none leading-relaxed"
                              style={{ minHeight: 72, background: 'var(--color-bg-card)', border: '1px solid var(--ds-caution-accent)', color: 'var(--color-text-primary)' }}
                              onKeyDown={e => { if (e.key === 'Escape') setEditingNote(null) }}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveNote(group.clientId, group.month, group.year)}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                                style={{ background: 'var(--ds-caution-accent)', color: '#fff' }}>
                                {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                Salvar
                              </button>
                              <button onClick={() => setEditingNote(null)}
                                className="px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ds-caution-text)' }}>{note}</p>
                        )}
                      </div>
                    ) : null}

                    {/* Posts list */}
                    <div className="divide-y divide-[var(--color-border)]">
                      {group.posts.map(post => {
                        const ptype = POST_TYPES[post.post_type] || { label: post.post_type, emoji: '📄', color: '#6b7280' }
                        const isFading = fadingPosts.has(post.id)
                        const isMarking = markingDone === post.id
                        return (
                          <div key={post.id}
                            className="flex items-center gap-3 px-5 py-3 transition-all duration-300"
                            style={{ opacity: isFading ? 0 : 1, transform: isFading ? 'translateX(12px) scale(0.98)' : 'none', background: isFading ? 'var(--ds-success-bg)' : undefined }}>
                            {/* Click row to open full PostCard */}
                            <button onClick={() => !isFading && openPost(post)} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                              <span className="text-lg flex-shrink-0" title={ptype.label}>{ptype.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                                  <span className="text-[var(--color-text-faint)] text-xs mr-1.5">#{post.post_number}</span>
                                  {post.title || 'Post sem título'}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: ptype.color + '22', color: ptype.color }}>{ptype.label}</span>
                                  {post.funil && <span className="text-[10px] text-[var(--color-text-muted)]">{post.funil}</span>}
                                  {post.scheduled_date && <span className="text-[10px] text-[var(--color-text-muted)]">📅 {formatDate(post.scheduled_date)}</span>}
                                </div>
                              </div>
                            </button>

                            {/* Quick "done" action */}
                            <button
                              onClick={() => markDone(post.id)}
                              disabled={isMarking || isFading}
                              title="Marcar como pronto e mover para revisão interna"
                              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex-shrink-0 transition-all duration-200 border disabled:pointer-events-none"
                              style={isMarking ? { background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)', borderColor: 'var(--ds-success-border)' }
                                : { background: 'transparent', color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
                              <span className="transition-all duration-200"
                                style={isMarking ? {} : undefined}>
                                {isMarking
                                  ? <Loader2 size={11} className="animate-spin" />
                                  : <CheckCircle2 size={11} className="group-hover:text-[var(--ds-success-text)] transition-colors" />}
                              </span>
                              <span className="group-hover:text-[var(--ds-success-text)] transition-colors">
                                {isMarking ? 'Enviando…' : 'Pronto'}
                              </span>
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    {/* "Add note" link when no note — subtle, below posts */}
                    {!note && !isEditing && (
                      <div className="flex justify-end px-5 py-2 border-t border-[var(--color-border)]">
                        <button
                          onClick={() => { setNoteText(''); setEditingNote(key) }}
                          className="flex items-center gap-1 text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors">
                          <Pencil size={10} /> Adicionar nota de produção
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Extras for this client */}
              {clientExtras.length > 0 && (
                <div className="border-t border-[var(--color-border)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] px-5 pt-3 pb-1">Extras</p>
                  <div className="divide-y divide-[var(--color-border)]">
                    {clientExtras.map(extra => {
                      const assigned = (extra.assigned_members || []).map(mid => memberMap[mid]).filter(Boolean)
                      return (
                        <div key={extra.id} className="flex items-start gap-3 px-5 py-3">
                          <span className="text-base flex-shrink-0 mt-0.5">📋</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{extra.title}</p>
                            {extra.description && (
                              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{extra.description}</p>
                            )}
                            {assigned.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                {assigned.map(m => m && (
                                  <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                                    style={{ background: (m.color || '#6b7280') + '22', color: m.color || '#6b7280' }}>
                                    {m.name.split(' ')[0]}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {extra.due_date && (
                            <span className="text-[11px] text-[var(--color-text-muted)] flex-shrink-0 mt-0.5">📅 {formatDate(extra.due_date)}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              </>
              )}
            </section>
          )
        })}

      </div>
    </div>

    {/* Full PostCard modal — same as cronograma */}
    {showPostCard && editingPostCtx && (
      <PostCard
        postId={editingPostId || undefined}
        clientId={editingPostCtx.clientId}
        clientName={editingPostCtx.clientName}
        clientColor={editingPostCtx.clientColor}
        month={editingPostCtx.month}
        year={editingPostCtx.year}
        onClose={() => { setShowPostCard(false); setEditingPostId(null); setEditingPostCtx(null) }}
        onSaved={() => load()}
        onDeleted={() => { setShowPostCard(false); setEditingPostId(null); setEditingPostCtx(null); load() }}
      />
    )}
    </>
  )
}
