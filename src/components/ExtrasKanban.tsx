'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { Plus, Link2, Check, Camera, Images, Video, Image as ImageIcon, Archive, ArchiveRestore } from 'lucide-react'
import ExtraCard from './ExtraCard'
import ExtraMiniCard from './ExtraMiniCard'

type ExtraType     = 'story' | 'carrossel_stories' | 'reels' | 'post'
type ExtraStatus   = 'backlog' | 'aguardando_aprovacao' | 'done'
type ExtraPriority = 'low' | 'normal' | 'high'

interface Extra {
  id: string
  client_id?: string | null
  title: string
  description?: string | null
  type: ExtraType
  status: ExtraStatus
  priority: ExtraPriority
  due_date?: string | null
  drive_url?: string | null
  assigned_member_id?: string | null
  assigned_members?: string[] | null
  labels?: { text: string; color: string }[] | null
  created_at: string
  completed_at?: string | null
  archived_at?: string | null
  clients?: { name: string; color_hex: string } | null
  team_members?: { name: string } | null
}

interface Member { id: string; name: string; role: string }
interface Client { id: string; name: string; color_hex: string }

const COLUMNS: { key: ExtraStatus; label: string; color: string }[] = [
  { key: 'backlog',              label: 'A fazer',      color: '#F59E0B' },
  { key: 'aguardando_aprovacao', label: 'Em aprovação', color: '#EC4899' },
  { key: 'done',                 label: 'Finalizados',  color: '#22C55E' },
]

const TYPE_CONFIG: Record<ExtraType, { icon: React.ElementType; color: string }> = {
  story:             { icon: Camera,    color: '#8b5cf6' },
  carrossel_stories: { icon: Images,    color: '#6366f1' },
  reels:             { icon: Video,     color: '#ef4444' },
  post:              { icon: ImageIcon, color: '#f59e0b' },
}

const PRIORITY_BORDER: Record<ExtraPriority, string> = {
  low:    '#94a3b8',
  normal: 'var(--color-border)',
  high:   '#ef4444',
}

interface ExtrasKanbanProps {
  clientId?: string | null
  globalMode?: boolean
  members?: Member[]
  initialOpenId?: string | null
  filterClient?: string
  onFilterClientChange?: (v: string) => void
  hideClientFilterUI?: boolean
  showArchived?: boolean
  onShowArchivedChange?: (v: boolean) => void
  hideArchiveToggleUI?: boolean
  onArchivedCountChange?: (n: number) => void
}

function formatDue(d: string) {
  const diff = Math.round((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000)
  if (diff === 0)  return 'Hoje'
  if (diff === 1)  return 'Amanhã'
  if (diff === -1) return 'Ontem'
  if (diff < -1)   return `${Math.abs(diff)}d atraso`
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

function isOverdue(due_date?: string | null, status?: ExtraStatus) {
  if (!due_date || status === 'done') return false
  return new Date(due_date + 'T23:59:59') < new Date()
}

export default function ExtrasKanban({ clientId, globalMode = false, members = [], initialOpenId, filterClient: filterClientProp, onFilterClientChange, hideClientFilterUI = false, showArchived: showArchivedProp, onShowArchivedChange, hideArchiveToggleUI = false, onArchivedCountChange }: ExtrasKanbanProps) {
  const supabase = createClient()
  const { currentMember, showOnlyMine } = useUser()
  const [extras,  setExtras]  = useState<Extra[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state — null = closed, string = editing existing, 'new:{status}' = creating in column
  const [openExtraId,     setOpenExtraId]     = useState<string | null>(initialOpenId || null)

  useEffect(() => { if (initialOpenId) setOpenExtraId(initialOpenId) }, [initialOpenId])
  const [newStatus,       setNewStatus]       = useState<ExtraStatus | null>(null)

  // Client filter (global mode) — controlado pelo pai (header da página) quando as props vêm preenchidas
  const [internalFilterClient, setInternalFilterClient] = useState<string>('all')
  const filterClient = filterClientProp !== undefined ? filterClientProp : internalFilterClient
  const setFilterClient = onFilterClientChange || setInternalFilterClient

  // Drag and drop
  const [draggingId,   setDraggingId]   = useState<string | null>(null)
  const [dragOverCol,  setDragOverCol]  = useState<ExtraStatus | null>(null)
  const [checkCounts,  setCheckCounts]  = useState<Record<string, { done: number; total: number }>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [copiedLink, setCopiedLink] = useState(false)
  const [internalShowArchived, setInternalShowArchived] = useState(false)
  const showArchived = showArchivedProp !== undefined ? showArchivedProp : internalShowArchived
  const setShowArchived = onShowArchivedChange || setInternalShowArchived

  async function archiveExtra(id: string) {
    setExtras(prev => prev.map(e => e.id === id ? { ...e, archived_at: new Date().toISOString() } : e))
    await supabase.from('extras').update({ archived_at: new Date().toISOString() }).eq('id', id)
  }
  async function unarchiveExtra(id: string) {
    setExtras(prev => prev.map(e => e.id === id ? { ...e, archived_at: null } : e))
    await supabase.from('extras').update({ archived_at: null }).eq('id', id)
  }

  async function copyExtrasApprovalLink() {
    if (!clientId) return
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const { data: existing } = await supabase.from('approval_tokens').select('token')
      .eq('client_id', clientId).eq('month', month).eq('year', year).eq('type', 'extras').maybeSingle()
    const token = existing?.token || (
      await supabase.from('approval_tokens').insert({ client_id: clientId, month, year, type: 'extras' }).select('token').single()
    ).data?.token
    if (!token) return
    navigator.clipboard.writeText(`${window.location.origin}/aprovar/${token}`)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  async function load() {
    setLoading(true)
    let q = supabase
      .from('extras')
      .select('*')
      .order('created_at', { ascending: true })
    if (clientId) q = q.eq('client_id', clientId)

    const { data, error } = await q
    if (error) console.error('ExtrasKanban load error:', error)
    if (data) setExtras(data as Extra[])

    // Always load clients for name lookup (even in non-global mode)
    const { data: cl } = await supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name')
    if (cl) setClients(cl)

    // Progresso do checklist por extra
    const { data: chk } = await supabase.from('extra_checklist').select('extra_id, done')
    const cc: Record<string, { done: number; total: number }> = {}
    ;(chk || []).forEach((x: any) => {
      if (!cc[x.extra_id]) cc[x.extra_id] = { done: 0, total: 0 }
      cc[x.extra_id].total++
      if (x.done) cc[x.extra_id].done++
    })
    setCheckCounts(cc)

    // Nº de comentários por extra
    const { data: cms } = await supabase.from('extra_comments').select('extra_id')
    const cmc: Record<string, number> = {}
    ;(cms || []).forEach((x: any) => { cmc[x.extra_id] = (cmc[x.extra_id] || 0) + 1 })
    setCommentCounts(cmc)

    setLoading(false)
  }

  useEffect(() => { load() }, [clientId])

  async function moveStatus(id: string, status: ExtraStatus) {
    const prevStatus = extras.find(e => e.id === id)?.status
    const patch: Record<string, any> = { status }
    if (status === 'done' && prevStatus !== 'done') patch.completed_at = new Date().toISOString()
    if (status !== 'done') patch.completed_at = null
    setExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
    const { error } = await supabase.from('extras').update(patch).eq('id', id)
    if (error) console.error('moveStatus error:', error)
  }

  function handleSaved(extra: Extra) {
    setExtras(prev => {
      const exists = prev.some(e => e.id === extra.id)
      return exists ? prev.map(e => e.id === extra.id ? extra : e) : [...prev, extra]
    })
    setOpenExtraId(null)
    setNewStatus(null)
  }

  function handleDeleted(id: string) {
    setExtras(prev => prev.filter(e => e.id !== id))
    setOpenExtraId(null)
    setNewStatus(null)
  }

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients])

  const archivedCount = useMemo(() => extras.filter(e => e.archived_at).length, [extras])
  useEffect(() => { onArchivedCountChange?.(archivedCount) }, [archivedCount, onArchivedCountChange])

  const filtered = useMemo(() => extras.filter(e => {
    if (showArchived ? !e.archived_at : !!e.archived_at) return false
    if (showOnlyMine && currentMember) {
      const assigned = e.assigned_members?.length ? e.assigned_members : e.assigned_member_id ? [e.assigned_member_id] : []
      if (!assigned.includes(currentMember.id)) return false
    }
    if (!globalMode) return true
    if (filterClient === 'all')    return true
    if (filterClient === 'global') return !e.client_id
    return e.client_id === filterClient
  }), [extras, globalMode, filterClient, showOnlyMine, currentMember, showArchived])

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-muted)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">

      {/* Link de aprovação de extras — só faz sentido no contexto de um cliente */}
      {clientId && (
        <div className="flex justify-end">
          <button onClick={copyExtrasApprovalLink}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
            style={copiedLink
              ? { borderColor: 'var(--ds-success-border)', color: 'var(--ds-success-text)', background: 'var(--ds-success-bg)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {copiedLink ? <><Check size={12} /> Link copiado!</> : <><Link2 size={12} /> Link de aprovação dos extras</>}
          </button>
        </div>
      )}

      {/* Filtro de cliente — select compacto (20+ clientes não cabem como chips).
          Some some no header da página quando hideClientFilterUI é passado. */}
      {globalMode && !hideClientFilterUI && (
        <div className="flex items-center gap-2">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="text-sm rounded-lg border bg-[var(--color-bg-card)] px-3 py-1.5 outline-none cursor-pointer font-medium"
            style={filterClient !== 'all'
              ? { borderColor: clients.find(c => c.id === filterClient)?.color_hex || 'var(--color-border-strong)', color: 'var(--color-text-primary)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <option value="all">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="global">Sem cliente</option>
          </select>
          {filterClient !== 'all' && (
            <button onClick={() => setFilterClient('all')} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">✕ limpar</button>
          )}
        </div>
      )}

      {/* Toggle de arquivados — some depois de finalizado deixa de ocupar espaço aqui.
          Some daqui quando hideArchiveToggleUI é passado (o header da página renderiza). */}
      {!hideArchiveToggleUI && (
      <div className="flex justify-end">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors"
          style={showArchived
            ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)', background: 'var(--color-accent)/8' }
            : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {showArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          {showArchived ? 'Ver board' : `Arquivo${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
        </button>
      </div>
      )}

      {showArchived ? (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--color-text-faint)] text-center py-8">Nenhum item arquivado.</p>
          )}
          {filtered.map(extra => (
            <div key={extra.id} className="flex items-center gap-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-3 py-2.5">
              <button onClick={() => { setOpenExtraId(extra.id); window.history.replaceState(null, '', `?post=${extra.id}`) }} className="flex-1 min-w-0 text-left flex items-center gap-2">
                {globalMode && extra.client_id && clientMap[extra.client_id] && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: clientMap[extra.client_id].color_hex }}>
                    {clientMap[extra.client_id].name}
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-primary)] truncate">{extra.title}</span>
              </button>
              <button onClick={() => unarchiveExtra(extra.id)} title="Desarquivar" className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors flex-shrink-0">
                <ArchiveRestore size={13} /> Desarquivar
              </button>
            </div>
          ))}
        </div>
      ) : (
      /* Kanban columns — no mobile rola tipo Trello (1 coluna por vez, com snap) */
      <div className="flex md:grid md:grid-cols-3 gap-5 overflow-x-auto snap-x snap-mandatory md:snap-none -mx-4 px-4 md:mx-0 md:px-0 pb-2 md:pb-0">
        {COLUMNS.map(col => {
          const colExtras = filtered.filter(e => e.status === col.key)
          const isDragTarget = dragOverCol === col.key && draggingId !== null

          return (
            <div key={col.key} className="flex flex-col gap-2 w-[calc(100vw-2rem)] flex-shrink-0 snap-center md:w-auto md:max-w-none md:flex-shrink md:snap-align-none"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
              onDrop={e => {
                e.preventDefault()
                const id = e.dataTransfer.getData('extraId')
                if (id && col.key !== extras.find(x => x.id === id)?.status) moveStatus(id, col.key)
                setDraggingId(null)
                setDragOverCol(null)
              }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{col.label}</span>
                  {colExtras.length > 0 && (
                    <span className="text-[10px] font-medium text-[var(--color-text-faint)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded-full">{colExtras.length}</span>
                  )}
                </div>
                <button
                  onClick={() => setNewStatus(col.key)}
                  className="w-6 h-6 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  title="Adicionar"
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* Cards */}
              <div className={`flex flex-col gap-2 min-h-[80px] rounded-xl transition-colors ${isDragTarget ? 'bg-[var(--color-bg-subtle)] ring-2 ring-[var(--color-brand)]/30' : ''}`}>
                {colExtras.map(extra => {
                  const assignedData = extra.assigned_members
                    ? members.filter(m => extra.assigned_members!.includes(m.id))
                    : []
                  return (
                    <ExtraMiniCard
                      key={extra.id}
                      extra={extra}
                      TypeIcon={(TYPE_CONFIG[extra.type] || TYPE_CONFIG.post).icon}
                      typeColor={(TYPE_CONFIG[extra.type] || TYPE_CONFIG.post).color}
                      priorityColor={PRIORITY_BORDER[extra.priority]}
                      overdue={isOverdue(extra.due_date, extra.status)}
                      assignedData={assignedData}
                      chk={checkCounts[extra.id]}
                      commentCount={commentCounts[extra.id] || 0}
                      clientBadge={globalMode && extra.client_id && clientMap[extra.client_id] ? { name: clientMap[extra.client_id].name, color: clientMap[extra.client_id].color_hex } : null}
                      showGlobalBadge={globalMode && !extra.client_id}
                      formatDue={formatDue}
                      dragging={draggingId === extra.id}
                      onDragStart={e => {
                        e.dataTransfer.setData('extraId', extra.id)
                        setDraggingId(extra.id)
                      }}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                      onClick={() => { if (!draggingId) { setOpenExtraId(extra.id); window.history.replaceState(null, '', `?post=${extra.id}`) } }}
                      onArchive={col.key === 'done' ? () => archiveExtra(extra.id) : undefined}
                    />
                  )
                })}

                {/* Empty state per column */}
                {colExtras.length === 0 && !isDragTarget && (
                  <button
                    onClick={() => setNewStatus(col.key)}
                    className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] py-6 border border-dashed border-[var(--color-border)] rounded-xl hover:border-[var(--color-border-hover)] transition-colors w-full"
                  >
                    <Plus size={13} /> Adicionar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* ExtraCard — edit existing */}
      {openExtraId && (
        <ExtraCard
          extraId={openExtraId}
          fixedClientId={clientId}
          clients={globalMode ? clients : []}
          members={members}
          onClose={() => { setOpenExtraId(null); window.history.replaceState(null, '', window.location.pathname) }}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {/* ExtraCard — create new in column */}
      {newStatus && (
        <ExtraCard
          initialStatus={newStatus}
          fixedClientId={clientId}
          clients={globalMode ? clients : []}
          members={members}
          onClose={() => setNewStatus(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
