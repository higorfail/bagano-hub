'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, CheckSquare, FileText, Bell, Calendar, User, AlertCircle } from 'lucide-react'
import ExtraCard from './ExtraCard'

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

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

  const filtered = extras.filter(e => {
    if (!globalMode) return true
    if (filterClient === 'all')    return true
    if (filterClient === 'global') return !e.client_id
    return e.client_id === filterClient
  })

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
                  const TypeIcon = TYPE_CONFIG[extra.type].icon
                  const overdue  = isOverdue(extra.due_date, extra.status)
                  const memberNames = extra.assigned_members
                    ? members.filter(m => extra.assigned_members!.includes(m.id)).map(m => m.name.split(' ')[0])
                    : []
                  const isDragging = draggingId === extra.id

                  return (
                    <div
                      key={extra.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('extraId', extra.id)
                        setDraggingId(extra.id)
                      }}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                      onClick={() => { if (!draggingId) { setOpenExtraId(extra.id); window.history.replaceState(null, '', `?post=${extra.id}`) } }}
                      className="group bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-3 cursor-grab active:cursor-grabbing shadow-card hover:shadow-pop hover:border-[var(--color-border-hover)] hover:-translate-y-0.5 transition-all duration-150 relative"
                      style={{
                        borderLeft: `3px solid ${PRIORITY_BORDER[extra.priority]}`,
                        opacity: isDragging ? 0.4 : 1,
                      }}
                    >
                      {/* Labels strip */}
                      {extra.labels && extra.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {extra.labels.map((l, i) => (
                            <span key={i} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white" style={{ background: l.color }}>
                              {l.text}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Type icon + title */}
                      <div className="flex items-start gap-2">
                        <TypeIcon size={13} strokeWidth={1.75}
                          style={{ color: TYPE_CONFIG[extra.type].color, flexShrink: 0, marginTop: 1.5 }} />
                        <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug flex-1 min-w-0 break-words"
                          style={{
                            textDecoration: extra.status === 'done' ? 'line-through' : 'none',
                            opacity:        extra.status === 'done' ? 0.5 : 1,
                          }}>
                          {extra.title}
                        </p>
                      </div>

                      {/* Description snippet */}
                      {extra.description && (
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 ml-5 line-clamp-2 leading-relaxed">
                          {extra.description}
                        </p>
                      )}

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 ml-5">
                        {extra.due_date && (
                          <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${overdue ? '' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]'}`} style={overdue ? { background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' } : {}}>
                            {overdue && <AlertCircle size={9} />}
                            <Calendar size={9} />
                            {formatDue(extra.due_date)}
                          </span>
                        )}
                        {memberNames.length > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                            <User size={9} />
                            {memberNames.join(', ')}
                          </span>
                        )}
                        {globalMode && extra.client_id && clientMap[extra.client_id] && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                            style={{ background: clientMap[extra.client_id].color_hex }}>
                            {clientMap[extra.client_id].name}
                          </span>
                        )}
                        {globalMode && !extra.client_id && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)]">Global</span>
                        )}
                      </div>
                    </div>
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
