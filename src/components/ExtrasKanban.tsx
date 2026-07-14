'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, CheckSquare, FileText, Bell } from 'lucide-react'
import ExtraCard from './ExtraCard'
import ExtraMiniCard from './ExtraMiniCard'

type ExtraType     = 'todo' | 'note' | 'reminder'
type ExtraStatus   = 'backlog' | 'doing' | 'done'
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
  clients?: { name: string; color_hex: string } | null
  team_members?: { name: string } | null
}

interface Member { id: string; name: string; role: string }
interface Client { id: string; name: string; color_hex: string }

const COLUMNS: { key: ExtraStatus; label: string; color: string }[] = [
  { key: 'backlog', label: 'A fazer',      color: '#6b7280' },
  { key: 'doing',   label: 'Em andamento', color: '#3b82f6' },
  { key: 'done',    label: 'Concluído',    color: '#22c55e' },
]

const TYPE_CONFIG: Record<ExtraType, { icon: React.ElementType; color: string }> = {
  todo:     { icon: CheckSquare, color: '#3b82f6' },
  note:     { icon: FileText,    color: '#f59e0b' },
  reminder: { icon: Bell,        color: '#8b5cf6' },
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

export default function ExtrasKanban({ clientId, globalMode = false, members = [], initialOpenId }: ExtrasKanbanProps) {
  const supabase = createClient()
  const [extras,  setExtras]  = useState<Extra[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state — null = closed, string = editing existing, 'new:{status}' = creating in column
  const [openExtraId,     setOpenExtraId]     = useState<string | null>(initialOpenId || null)

  useEffect(() => { if (initialOpenId) setOpenExtraId(initialOpenId) }, [initialOpenId])
  const [newStatus,       setNewStatus]       = useState<ExtraStatus | null>(null)

  // Client filter (global mode)
  const [filterClient, setFilterClient] = useState<string>('all')

  // Drag and drop
  const [draggingId,   setDraggingId]   = useState<string | null>(null)
  const [dragOverCol,  setDragOverCol]  = useState<ExtraStatus | null>(null)
  const [checkCounts,  setCheckCounts]  = useState<Record<string, { done: number; total: number }>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

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
    setExtras(prev => prev.map(e => e.id === id ? { ...e, status } : e))
    const { error } = await supabase.from('extras').update({ status }).eq('id', id)
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

  const filtered = useMemo(() => extras.filter(e => {
    if (!globalMode) return true
    if (filterClient === 'all')    return true
    if (filterClient === 'global') return !e.client_id
    return e.client_id === filterClient
  }), [extras, globalMode, filterClient])

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-text-muted)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">

      {/* Client filter chips — global only */}
      {globalMode && (
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all',    name: 'Todos',       color_hex: 'var(--color-brand)' },
            ...clients,
            { id: 'global', name: 'Sem cliente', color_hex: '#94a3b8' },
          ].map(c => (
            <button key={c.id}
              onClick={() => setFilterClient(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${filterClient === c.id ? 'border-transparent text-white' : 'border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)]'}`}
              style={filterClient === c.id ? { background: c.color_hex } : {}}
            >
              {c.id !== 'all' && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color_hex }} />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-3 gap-5">
        {COLUMNS.map(col => {
          const colExtras = filtered.filter(e => e.status === col.key)
          const isDragTarget = dragOverCol === col.key && draggingId !== null

          return (
            <div key={col.key} className="flex flex-col gap-2"
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
                      TypeIcon={TYPE_CONFIG[extra.type].icon}
                      typeColor={TYPE_CONFIG[extra.type].color}
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
