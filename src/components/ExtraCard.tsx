'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import ActivityLog from '@/components/ActivityLog'
import { useToast } from '@/lib/ToastContext'
import {
  X, Plus, Calendar, Tag, CheckSquare, Paperclip,
  Trash2, Link2, MessageSquare, User, AlignLeft, Check,
  FileText, Bell, ChevronRight
} from 'lucide-react'

type ExtraType     = 'todo' | 'note' | 'reminder'
type ExtraStatus   = 'backlog' | 'doing' | 'done'
type ExtraPriority = 'low' | 'normal' | 'high'

const TYPE_OPTIONS: { value: ExtraType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'todo',     label: 'Tarefa',   icon: CheckSquare, color: '#3b82f6' },
  { value: 'note',     label: 'Nota',     icon: FileText,    color: '#f59e0b' },
  { value: 'reminder', label: 'Lembrete', icon: Bell,        color: '#8b5cf6' },
]
const STATUS_OPTIONS: { value: ExtraStatus; label: string; color: string }[] = [
  { value: 'backlog', label: 'A fazer',      color: '#6b7280' },
  { value: 'doing',   label: 'Em andamento', color: '#3b82f6' },
  { value: 'done',    label: 'Concluído',    color: '#22c55e' },
]
const PRIORITY_OPTIONS: { value: ExtraPriority; label: string; color: string }[] = [
  { value: 'low',    label: 'Baixa',  color: '#94a3b8' },
  { value: 'normal', label: 'Normal', color: '#6b7280' },
  { value: 'high',   label: 'Alta',   color: '#ef4444' },
]
const TYPE_KEYWORDS: Record<ExtraType, string[]> = {
  reminder: ['lembrar', 'lembrete', 'lembrança', 'não esquecer', 'não esqueça', 'avisar', 'aviso', 'alerta', 'reminder', 'remind'],
  note:     ['nota', 'anotação', 'anotar', 'observação', 'obs:', 'obs ', 'ideia', 'ideias', 'referência', 'ref:', 'pesquisa', 'insight', 'note'],
  todo:     ['fazer', 'criar', 'corrigir', 'implementar', 'desenvolver', 'atualizar', 'revisar', 'tarefa', 'todo', 'pendente'],
}

const LABEL_PALETTE = [
  { name: 'Vermelho', color: '#EF4444' }, { name: 'Laranja', color: '#F59E0B' },
  { name: 'Amarelo',  color: '#EAB308' }, { name: 'Verde',   color: '#22C55E' },
  { name: 'Azul',     color: '#3B82F6' }, { name: 'Roxo',    color: '#8B5CF6' },
  { name: 'Rosa',     color: '#EC4899' }, { name: 'Cinza',   color: '#6B7280' },
]

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

type Props = {
  extraId?: string
  initialStatus?: ExtraStatus
  fixedClientId?: string | null
  clients?: { id: string; name: string; color_hex: string }[]
  members?: { id: string; name: string; role: string }[]
  onClose: () => void
  onSaved: (extra: any) => void
  onDeleted?: (id: string) => void
}

export default function ExtraCard({ extraId, initialStatus, fixedClientId, clients = [], members: membersProp, onClose, onSaved, onDeleted }: Props) {
  const { members: ctxMembers, currentMember } = useUser()
  const { toast } = useToast()
  const members = membersProp ?? ctxMembers
  const supabase = createClient()

  const [loading, setLoading] = useState(!!extraId)
  const [saving,  setSaving]  = useState(false)
  const [id,      setId]      = useState<string | undefined>(extraId)
  const [linkCopied, setLinkCopied] = useState(false)
  const originalStatusRef = useRef<ExtraStatus>(initialStatus ?? 'backlog')
  const [sideTab,     setSideTab]     = useState<'comments' | 'history'>('comments')
  const [activityKey, setActivityKey] = useState(0)

  // Track manual overrides so auto-detect doesn't fight the user
  const [typeManuallySet,   setTypeManuallySet]   = useState(!!extraId)
  const [clientManuallySet, setClientManuallySet] = useState(!!extraId || !!fixedClientId)

  const [title,           setTitle]           = useState('')
  const [type,            setType]            = useState<ExtraType>('todo')
  const [status,          setStatus]          = useState<ExtraStatus>(initialStatus ?? 'backlog')
  const [priority,        setPriority]        = useState<ExtraPriority>('normal')
  const [clientId,        setClientId]        = useState(fixedClientId || '')
  const [description,     setDescription]     = useState('')
  const [dueDate,         setDueDate]         = useState('')
  const [dueTime,         setDueTime]         = useState('')
  const [labels,          setLabels]          = useState<{ text: string; color: string }[]>([])
  const [assignedMembers, setAssignedMembers] = useState<string[]>([])

  const [needsClientApproval, setNeedsClientApproval] = useState(false)

  const [checklist,      setChecklist]      = useState<any[]>([])
  const [newCheckText,   setNewCheckText]   = useState('')
  const [comments,       setComments]       = useState<any[]>([])
  const [newComment,     setNewComment]     = useState('')
  const [attachments,    setAttachments]    = useState<any[]>([])
  const [newAttachUrl,   setNewAttachUrl]   = useState('')
  const [newAttachTitle, setNewAttachTitle] = useState('')

  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const [showLabelPicker,  setShowLabelPicker]  = useState(false)
  const [showDatePicker,   setShowDatePicker]   = useState(false)
  const [showAttachInput,  setShowAttachInput]  = useState(false)
  const [globalLabels,     setGlobalLabels]     = useState<any[]>([])
  const [labelDraft,       setLabelDraft]       = useState({ text: '', color: '#3B82F6' })
  const [editingLabel,     setEditingLabel]     = useState<any>(null)
  const [calMonth,         setCalMonth]         = useState(() => {
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }
  })

  const orderedMembers    = [...members].sort((a, b) => {
    const score = (m: any) => (m.role === 'designer' ? 0 : m.role === 'editor' ? 1 : 2)
    return score(a) - score(b)
  })
  const selectedMembersData = assignedMembers.map(mid => members.find(m => m.id === mid)).filter(Boolean)

  const loadSub = useCallback(async (eid: string) => {
    const [{ data: chk }, { data: cms }, { data: atts }] = await Promise.all([
      supabase.from('extra_checklist').select('*').eq('extra_id', eid).order('position', { ascending: true }),
      supabase.from('extra_comments').select('*').eq('extra_id', eid).order('created_at', { ascending: true }),
      supabase.from('extra_attachments').select('*').eq('extra_id', eid).order('created_at', { ascending: true }),
    ])
    setChecklist(chk || [])
    setComments(cms || [])
    setAttachments(atts || [])
  }, [])

  useEffect(() => {
    supabase.from('labels').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setGlobalLabels(data) })
  }, [])

  // Smart auto-detection as the user types the title
  useEffect(() => {
    if (!title.trim()) return
    const lower = title.toLowerCase()

    if (!typeManuallySet) {
      for (const [t, kws] of Object.entries(TYPE_KEYWORDS) as [ExtraType, string[]][]) {
        if (kws.some(kw => lower.includes(kw))) {
          setType(t)
          break
        }
      }
    }

    if (!clientManuallySet && !fixedClientId && clients.length > 0) {
      const match = clients.find(c => lower.includes(c.name.toLowerCase()))
      if (match) setClientId(match.id)
    }
  }, [title])

  useEffect(() => {
    if (!extraId) return
    async function load() {
      const { data } = await supabase.from('extras').select('*').eq('id', extraId).single()
      if (data) {
        setTitle(data.title || '')
        setType(data.type || 'todo')
        setStatus(data.status || 'backlog')
        originalStatusRef.current = data.status || 'backlog'
        setPriority(data.priority || 'normal')
        setClientId(data.client_id || '')
        setDescription(data.description || '')
        setDueDate(data.due_date || '')
        setDueTime(data.due_time || '')
        setLabels(Array.isArray(data.labels) ? data.labels : [])
        setNeedsClientApproval(data.needs_client_approval || false)
        const am = Array.isArray(data.assigned_members) && data.assigned_members.length > 0
          ? data.assigned_members : data.assigned_member_id ? [data.assigned_member_id] : []
        setAssignedMembers(am)
      }
      await loadSub(extraId)
      setLoading(false)
    }
    load()
  }, [extraId, loadSub])

  async function ensureId(): Promise<string | undefined> {
    if (id) return id
    if (!title.trim()) return undefined
    const payload = {
      title, type, status, priority,
      client_id: fixedClientId || clientId || null,
      description, due_date: dueDate || null, due_time: dueTime || null,
      assigned_members: assignedMembers, assigned_member_id: assignedMembers[0] || null, labels,
    }
    const { data, error } = await supabase.from('extras').insert(payload).select('*').single()
    if (error) console.error('ensureId error:', error)
    if (data) { setId(data.id); return data.id }
    return undefined
  }

  async function handleSaveMain() {
    if (!title.trim()) return
    setSaving(true)
    const payload: any = {
      title, type, status, priority,
      client_id: fixedClientId || clientId || null,
      description, due_date: dueDate || null, due_time: dueTime || null,
      assigned_members: assignedMembers, assigned_member_id: assignedMembers[0] || null, labels,
      needs_client_approval: needsClientApproval,
    }
    // Build client/member info locally to avoid depending on PostgREST joins
    const resolvedClientId = fixedClientId || clientId || null
    const clientInfo = resolvedClientId ? clients.find(c => c.id === resolvedClientId) : null
    function withRelations(raw: any) {
      return {
        ...raw,
        clients: clientInfo ? { name: clientInfo.name, color_hex: clientInfo.color_hex } : null,
        team_members: null,
      }
    }

    let savedData: any
    if (!id) {
      const { data, error } = await supabase.from('extras').insert(payload).select('*').single()
      if (error || !data) {
        console.error('Extra save error:', error)
        toast(`Erro ao salvar: ${error?.message ?? 'resposta vazia'}`)
        setSaving(false)
        return
      }
      setId(data.id)
      savedData = withRelations(data)
      originalStatusRef.current = status
      await logActivity({ tableName: 'extras', recordId: data.id, clientId: resolvedClientId, action: 'created', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} criou "${title}"` })
      setActivityKey(k => k + 1)
    } else {
      const statusLabels: Record<string,string> = { backlog: 'A fazer', doing: 'Em andamento', done: 'Concluído' }
      if (status !== originalStatusRef.current) {
        const oldLabel = statusLabels[originalStatusRef.current] || originalStatusRef.current
        const newLabel = statusLabels[status] || status
        await logActivity({ tableName: 'extras', recordId: id, clientId: fixedClientId || clientId || null, action: 'status_changed', actorName: currentMember?.name, field: 'status', oldValue: oldLabel, newValue: newLabel, description: `Status mudou: ${oldLabel} → ${newLabel}` })
        originalStatusRef.current = status as ExtraStatus
        setActivityKey(k => k + 1)
      }
      const { data } = await supabase.from('extras').update(payload).eq('id', id).select('*').single()
      savedData = data ? withRelations(data) : null
    }
    setSaving(false)
    if (savedData) { toast('Extra salvo!'); onSaved(savedData) }
  }

  async function handleDelete() {
    if (!id) { onClose(); return }
    await logActivity({ tableName: 'extras', recordId: id, clientId: fixedClientId || clientId || null, action: 'deleted', actorName: currentMember?.name, description: `${currentMember?.name || 'Alguém'} excluiu "${title}"` })
    await supabase.from('extras').delete().eq('id', id)
    if (onDeleted) onDeleted(id)
    onClose()
  }

  async function addCheck() {
    if (!newCheckText.trim()) return
    const eid = await ensureId(); if (!eid) return
    const { data } = await supabase.from('extra_checklist').insert({ extra_id: eid, text: newCheckText, position: checklist.length }).select().single()
    if (data) setChecklist(c => [...c, data]); setNewCheckText('')
  }
  async function toggleCheck(item: any) {
    await supabase.from('extra_checklist').update({ done: !item.done }).eq('id', item.id)
    setChecklist(c => c.map(x => x.id === item.id ? { ...x, done: !x.done } : x))
  }
  async function removeCheck(cid: string) {
    await supabase.from('extra_checklist').delete().eq('id', cid)
    setChecklist(c => c.filter(x => x.id !== cid))
  }

  async function addComment() {
    if (!newComment.trim()) return
    const eid = await ensureId(); if (!eid) return
    const authorName = currentMember?.name || 'Você'
    const body = newComment
    const { data } = await supabase.from('extra_comments').insert({ extra_id: eid, body, author_name: authorName }).select().single()
    if (data) setComments(c => [...c, data])
    setNewComment('')
    await logActivity({ tableName: 'extras', recordId: eid, clientId: fixedClientId || clientId || null, action: 'commented', actorName: authorName, description: `${authorName} comentou: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"` })
    setActivityKey(k => k + 1)
  }

  async function addAttachment() {
    if (!newAttachUrl.trim()) return
    const eid = await ensureId(); if (!eid) return
    const { data } = await supabase.from('extra_attachments').insert({ extra_id: eid, url: newAttachUrl, title: newAttachTitle || newAttachUrl }).select().single()
    if (data) setAttachments(a => [...a, data])
    setNewAttachUrl(''); setNewAttachTitle(''); setShowAttachInput(false)
  }
  async function removeAttachment(aid: string) {
    await supabase.from('extra_attachments').delete().eq('id', aid)
    setAttachments(a => a.filter(x => x.id !== aid))
  }

  async function createGlobalLabel(text: string, color: string) {
    const { data } = await supabase.from('labels').insert({ text, color }).select().single()
    if (data) setGlobalLabels(g => [...g, data]); return data
  }
  async function updateGlobalLabel(labelId: string, text: string, color: string) {
    const old = globalLabels.find(g => g.id === labelId)
    await supabase.from('labels').update({ text, color }).eq('id', labelId)
    setGlobalLabels(g => g.map(x => x.id === labelId ? { ...x, text, color } : x))
    if (old) setLabels(ls => ls.map(l => (l.text === old.text && l.color === old.color) ? { text, color } : l))
    setEditingLabel(null)
  }
  async function deleteGlobalLabel(labelId: string) {
    const old = globalLabels.find(g => g.id === labelId)
    await supabase.from('labels').delete().eq('id', labelId)
    setGlobalLabels(g => g.filter(x => x.id !== labelId))
    if (old) setLabels(ls => ls.filter(l => !(l.text === old.text && l.color === old.color)))
    setEditingLabel(null)
  }

  const checkDone  = checklist.filter(c => c.done).length
  const checkPct   = checklist.length ? Math.round((checkDone / checklist.length) * 100) : 0
  const typeObj     = TYPE_OPTIONS.find(t => t.value === type)!
  const statusObj   = STATUS_OPTIONS.find(s => s.value === status)!
  const TypeIcon    = typeObj.icon
  const clientName  = clients.find(c => c.id === clientId)?.name

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
      <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
    </div>
  )

  const dueDateLabel = (() => {
    if (!dueDate) return null
    const diff = Math.ceil((new Date(dueDate + 'T23:59:59').getTime() - Date.now()) / 86400000)
    const color = diff < 0 ? '#EF4444' : diff <= 2 ? '#F59E0B' : 'var(--color-text-secondary)'
    const label = diff < 0 ? 'atrasado' : diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : ''
    return { text: new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + (dueTime ? ` · ${dueTime}` : '') + (label ? ` · ${label}` : ''), color }
  })()

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center py-6 px-4"
      onClick={e => { if (e.target === e.currentTarget) { handleSaveMain(); onClose() } }}
    >
      <div className="bg-[var(--color-bg-alt)] rounded-2xl w-full max-w-[920px] max-h-[92vh] flex flex-col shadow-pop overflow-hidden animate-scale-in">

        {/* Colored accent bar */}
        <div className="h-[3px] flex-shrink-0 rounded-t-2xl" style={{ background: typeObj.color }} />

        {/* HEADER */}
        <div className="flex items-center justify-between px-7 py-3.5 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1.5">
            <TypeIcon size={14} strokeWidth={2} style={{ color: typeObj.color, flexShrink: 0 }} />
            <span className="text-xs font-semibold mr-3" style={{ color: typeObj.color }}>{typeObj.label}</span>
            <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
            {STATUS_OPTIONS.map(s => (
              <button key={s.value} onClick={() => { setStatus(s.value) }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={status === s.value ? { background: s.color + '22', color: s.color } : { color: 'var(--color-text-faint)' }}>
                {s.label}
              </button>
            ))}
            <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
            {PRIORITY_OPTIONS.map(p => (
              <button key={p.value} onClick={() => { setPriority(p.value) }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={priority === p.value ? { background: p.color + '22', color: p.color } : { color: 'var(--color-text-faint)' }}>
                {p.label}
              </button>
            ))}
          </div>
          {id && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/dashboard/extras?post=${id}`
                navigator.clipboard.writeText(url)
                setLinkCopied(true)
                setTimeout(() => setLinkCopied(false), 2000)
              }}
              title="Copiar link do card"
              className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-colors"
              style={{ color: linkCopied ? 'var(--ds-success-text)' : 'var(--color-text-secondary)' }}>
              {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
            </button>
          )}
          <button onClick={() => { handleSaveMain(); onClose() }}
            className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* TITLE */}
        <div className="px-7 pt-6 pb-4 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Sem título…"
            autoFocus={!extraId}
            className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder:text-[var(--color-text-faint)] leading-tight"
          />
          {(clientName || (!fixedClientId && !clientId)) && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
              {clientName ? <>em <span className="font-semibold text-[var(--color-text-secondary)]">{clientName}</span></> : 'sem cliente'}
            </p>
          )}
        </div>

        {/* BODY */}
        <div className="flex gap-0 overflow-y-auto flex-1 divide-x divide-[var(--color-border)]">

          {/* LEFT — main content */}
          <div className="flex-1 min-w-0 flex flex-col gap-0 overflow-y-auto">

            {/* PROPERTIES — Linear-style rows */}
            <div className="px-7 py-5 flex flex-col gap-0 border-b border-[var(--color-border)]">
              {/* Tipo */}
              <div className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-2 w-36 flex-shrink-0">
                  <Tag size={13} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Tipo</span>
                </div>
                <div className="flex items-center gap-1">
                  {TYPE_OPTIONS.map(t => { const TIcon = t.icon; return (
                    <button key={t.value} onClick={() => { setType(t.value); setTypeManuallySet(true) }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={type === t.value ? { background: t.color + '20', color: t.color } : { color: 'var(--color-text-muted)' }}>
                      <TIcon size={11} /> {t.label}
                    </button>
                  )})}
                </div>
              </div>

              {/* Data limite */}
              <div className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-2 w-36 flex-shrink-0">
                  <Calendar size={13} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Data limite</span>
                </div>
                <button onClick={() => setShowDatePicker(true)}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:bg-[var(--color-bg-subtle)]"
                  style={{ color: dueDateLabel ? dueDateLabel.color : 'var(--color-text-muted)' }}>
                  {dueDateLabel ? dueDateLabel.text : '+ Definir data'}
                </button>
              </div>

              {/* Responsáveis */}
              <div className="flex items-start gap-3 py-2">
                <div className="flex items-center gap-2 w-36 flex-shrink-0 mt-1">
                  <User size={13} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Responsáveis</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap cursor-pointer" onClick={() => setShowMemberPicker(p => !p)}>
                    {selectedMembersData.length === 0 && (
                      <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] px-1">+ Atribuir</span>
                    )}
                    {selectedMembersData.map((m: any) => (
                      <div key={m.id} className="flex items-center gap-1 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-full pl-1 pr-2 py-0.5">
                        <div className="w-5 h-5 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-fg)] text-[8px] font-bold flex-shrink-0">
                          {initials(m.name)}
                        </div>
                        <span className="text-xs text-[var(--color-text-primary)] font-medium">{m.name.split(' ')[0]}</span>
                        <button onClick={e => { e.stopPropagation(); setAssignedMembers(prev => prev.filter(x => x !== m.id)) }}
                          className="text-[var(--color-text-muted)] ml-0.5 leading-none transition-colors" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}><X size={10} /></button>
                      </div>
                    ))}
                    {selectedMembersData.length > 0 && (
                      <button className="w-5 h-5 rounded-full border border-dashed border-[var(--color-border-hover)] flex items-center justify-center text-[var(--color-text-muted)] hover:border-[var(--color-brand)]">
                        <Plus size={10} />
                      </button>
                    )}
                  </div>
                  {showMemberPicker && (
                    <div className="mt-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto z-10">
                      {orderedMembers.map(m => {
                        const sel = assignedMembers.includes(m.id)
                        return (
                          <button key={m.id}
                            onClick={() => setAssignedMembers(prev => sel ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--color-bg-subtle)] transition-colors">
                            <div className="w-7 h-7 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-fg)] text-[9px] font-bold flex-shrink-0">
                              {initials(m.name)}
                            </div>
                            <div className="flex-1 text-left">
                              <p className="text-sm text-[var(--color-text-primary)] font-medium">{m.name}</p>
                              <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{m.role}</p>
                            </div>
                            {sel && <Check size={14} className="text-[#22C55E] flex-shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Cliente (global only) */}
              {!fixedClientId && clients.length > 0 && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex items-center gap-2 w-36 flex-shrink-0">
                    <span className="text-[13px] text-[var(--color-text-muted)]">🏢</span>
                    <span className="text-xs text-[var(--color-text-muted)]">Cliente</span>
                  </div>
                  <select value={clientId} onChange={e => { setClientId(e.target.value); setClientManuallySet(true) }}
                    className="text-xs font-medium bg-transparent border-none outline-none text-[var(--color-text-secondary)] cursor-pointer">
                    <option value="">— nenhum —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Aprovação do cliente */}
              <div className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-2 w-36 flex-shrink-0">
                  <span className="text-[13px] text-[var(--color-text-muted)]">✅</span>
                  <span className="text-xs text-[var(--color-text-muted)]">Aprovação</span>
                </div>
                <button
                  onClick={() => setNeedsClientApproval(v => !v)}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={needsClientApproval
                    ? { background: '#3b82f620', color: '#3b82f6' }
                    : { color: 'var(--color-text-muted)' }}
                >
                  {needsClientApproval ? '✓ Cliente precisa aprovar' : 'Não precisa de aprovação'}
                </button>
              </div>

              {/* Etiquetas */}
              <div className="flex items-start gap-3 py-2">
                <div className="flex items-center gap-2 w-36 flex-shrink-0 mt-0.5">
                  <Tag size={13} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Etiquetas</span>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {labels.map((l, i) => (
                    <span key={i} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md text-white" style={{ background: l.color }}>
                      {l.text}
                      <button onClick={() => setLabels(ls => ls.filter((_, idx) => idx !== i))}><X size={9} /></button>
                    </span>
                  ))}
                  <button onClick={() => setShowLabelPicker(true)}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] px-1 py-0.5 rounded transition-colors">
                    + Etiqueta
                  </button>
                </div>
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="px-7 py-5 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 mb-3">
                <AlignLeft size={14} className="text-[var(--color-text-muted)]" />
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Descrição</span>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Adicione uma descrição, contexto, links…"
                className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none resize-none leading-relaxed placeholder:text-[var(--color-text-faint)]"
              />
            </div>

            {/* CHECKLIST */}
            <div className="px-7 py-5 border-b border-[var(--color-border)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckSquare size={14} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Checklist</span>
                  {checklist.length > 0 && <span className="text-[10px] text-[var(--color-text-faint)]">{checkDone}/{checklist.length}</span>}
                </div>
              </div>
              {checklist.length > 0 && (
                <div className="w-full h-1 bg-[var(--color-bg-subtle)] rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-[#22C55E] transition-all rounded-full" style={{ width: `${checkPct}%` }} />
                </div>
              )}
              <div className="flex flex-col gap-0.5 mb-2">
                {checklist.map(item => (
                  <div key={item.id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-subtle)]">
                    <button onClick={() => toggleCheck(item)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${item.done ? 'bg-[#22C55E] border-[#22C55E]' : 'border-[var(--color-border-hover)] hover:border-[#22C55E]'}`}>
                      {item.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    <span className={`text-sm flex-1 ${item.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>{item.text}</span>
                    <button onClick={() => removeCheck(item.id)} className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] transition-opacity" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input value={newCheckText} onChange={e => setNewCheckText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCheck() }}
                  placeholder="Novo item… (Enter)"
                  className="flex-1 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] transition-colors" />
              </div>
            </div>

            {/* ATTACHMENTS */}
            <div className="px-7 py-5">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip size={14} className="text-[var(--color-text-muted)]" />
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Anexos</span>
              </div>
              {attachments.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {attachments.map(a => (
                    <div key={a.id} className="group flex items-center gap-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-xl px-3 py-2">
                      <Link2 size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
                      <a href={a.url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-sm hover:underline truncate" style={{ color: 'var(--ds-info-text)' }}>{a.title}</a>
                      <button onClick={() => removeAttachment(a.id)} className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] transition-opacity" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              {!showAttachInput ? (
                <button onClick={() => setShowAttachInput(true)}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
                  + Adicionar link
                </button>
              ) : (
                <div className="flex flex-col gap-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-xl p-3">
                  <input value={newAttachUrl} onChange={e => setNewAttachUrl(e.target.value)} placeholder="https://…"
                    className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]" />
                  <input value={newAttachTitle} onChange={e => setNewAttachTitle(e.target.value)} placeholder="Nome (opcional)"
                    className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] bg-[var(--color-bg-card)]" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAttachInput(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]">Cancelar</button>
                    <button onClick={addAttachment} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">Anexar</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — comentários / histórico */}
          <div className="w-80 flex-shrink-0 flex flex-col bg-[var(--color-bg-card)]">
            <div className="px-5 py-3.5 border-b border-[var(--color-border)]">
              <div className="flex rounded-lg bg-[var(--color-bg-subtle)] p-0.5">
                <button onClick={() => setSideTab('comments')} className={`flex-1 text-xs font-medium py-1 rounded-md transition-all ${sideTab === 'comments' ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>
                  Comentários {comments.length > 0 ? `(${comments.length})` : ''}
                </button>
                <button onClick={() => setSideTab('history')} className={`flex-1 text-xs font-medium py-1 rounded-md transition-all ${sideTab === 'history' ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>
                  Histórico
                </button>
              </div>
            </div>

            {sideTab === 'history' ? (
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <ActivityLog tableName="extras" recordId={id || extraId || ''} refreshKey={activityKey} />
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {comments.length === 0 && (
                <p className="text-xs text-[var(--color-text-faint)] text-center py-6">Nenhum comentário.</p>
              )}
              {[...comments].reverse().map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-fg)] text-[8px] font-bold flex-shrink-0 mt-0.5">
                    {initials(c.author_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] mb-1">
                      <span className="font-semibold text-[var(--color-text-secondary)]">{c.author_name}</span>
                      <span className="text-[var(--color-text-faint)] ml-1.5">
                        {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-xl px-3 py-2 whitespace-pre-wrap leading-relaxed">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            )}
            {/* Comment input — só quando na aba comentários */}
            {sideTab === 'comments' && <div className="px-5 py-4 border-t border-[var(--color-border)]">
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-fg)] text-[8px] font-bold flex-shrink-0 mt-0.5">
                  {currentMember ? initials(currentMember.name) : 'VO'}
                </div>
                <div className="flex-1">
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment() }}
                    rows={2}
                    placeholder="Comentar… (⌘Enter)"
                    className="w-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)] resize-none transition-colors"
                  />
                  {newComment.trim() && (
                    <button onClick={addComment} className="mt-1.5 w-full text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-[var(--color-brand-fg)]">
                      Comentar
                    </button>
                  )}
                </div>
              </div>
            </div>}
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-7 py-3.5 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)]">
          <button onClick={handleDelete} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] transition-colors" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
            <Trash2 size={13} /> Excluir
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => { onClose() }} className="px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              Cancelar
            </button>
            <button onClick={() => { handleSaveMain(); onClose() }} disabled={saving || !title.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg disabled:opacity-40 transition-opacity">
              {saving ? 'Salvando…' : 'Salvar'} {!saving && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* LABEL PICKER */}
      {showLabelPicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowLabelPicker(false)}>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Etiquetas</p>
            {globalLabels.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-3 max-h-52 overflow-y-auto">
                {globalLabels.map(gl => {
                  const applied  = labels.some(l => l.text === gl.text && l.color === gl.color)
                  const isEditing = editingLabel?.id === gl.id
                  if (isEditing) return (
                    <div key={gl.id} className="border border-[var(--color-border)] rounded-lg p-2.5 bg-[var(--color-bg-alt)]">
                      <input value={editingLabel.text} onChange={e => setEditingLabel((d: any) => ({ ...d, text: e.target.value }))}
                        className="w-full border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-sm outline-none focus:border-[var(--color-brand)] mb-2" />
                      <div className="flex flex-wrap gap-1 mb-2">
                        {LABEL_PALETTE.map(p => <button key={p.color} onClick={() => setEditingLabel((d: any) => ({ ...d, color: p.color }))}
                          className={`w-6 h-6 rounded ${editingLabel.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`} style={{ background: p.color }} />)}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => updateGlobalLabel(gl.id, editingLabel.text, editingLabel.color)} className="flex-1 py-1.5 text-xs font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Salvar</button>
                        <button onClick={() => deleteGlobalLabel(gl.id)} className="px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors" style={{ borderColor: 'var(--ds-error-border)', color: 'var(--ds-error-text)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--ds-error-bg)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>Excluir</button>
                        <button onClick={() => setEditingLabel(null)} className="px-3 py-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">×</button>
                      </div>
                    </div>
                  )
                  return (
                    <div key={gl.id} className="flex items-center gap-1.5 group">
                      <button onClick={() => applied ? setLabels(ls => ls.filter(l => !(l.text === gl.text && l.color === gl.color))) : setLabels(ls => [...ls, { text: gl.text, color: gl.color }])}
                        className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded text-white truncate" style={{ background: gl.color }}>{gl.text}</span>
                        {applied && <Check size={14} className="text-[var(--color-text-primary)] flex-shrink-0" />}
                      </button>
                      <button onClick={() => setEditingLabel({ id: gl.id, text: gl.text, color: gl.color })}
                        className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="text-xs text-[var(--color-text-muted)] mb-2">Criar nova</p>
              <input value={labelDraft.text} onChange={e => setLabelDraft(d => ({ ...d, text: e.target.value }))} placeholder="Texto da etiqueta"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] mb-2" />
              <div className="flex flex-wrap gap-1.5 mb-3">
                {LABEL_PALETTE.map(p => <button key={p.color} onClick={() => setLabelDraft(d => ({ ...d, color: p.color }))}
                  className={`w-7 h-7 rounded-lg ${labelDraft.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`} style={{ background: p.color }} />)}
              </div>
              <button onClick={async () => { if (labelDraft.text.trim()) { await createGlobalLabel(labelDraft.text, labelDraft.color); setLabels(ls => [...ls, { ...labelDraft }]); setLabelDraft({ text: '', color: '#3B82F6' }) } }}
                className="w-full py-2 text-sm font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Criar e aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* DATE PICKER */}
      {showDatePicker && (() => {
        const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
        const DIAS  = ['dom','seg','ter','qua','qui','sex','sáb']
        const startWeekday = new Date(calMonth.y, calMonth.m, 1).getDay()
        const daysInMonth  = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
        const cells: (number|null)[] = [...Array(startWeekday).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i+1)]
        function pick(d: number) {
          const mm = String(calMonth.m + 1).padStart(2,'0'), dd = String(d).padStart(2,'0')
          setDueDate(`${calMonth.y}-${mm}-${dd}`)
        }
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowDatePicker(false)}>
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[var(--color-text-primary)]">Data limite</p>
                <button onClick={() => setShowDatePicker(false)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]"><X size={14} /></button>
              </div>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setCalMonth(c => c.m === 0 ? {y:c.y-1,m:11} : {y:c.y,m:c.m-1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                <span className="text-sm font-semibold text-[var(--color-text-primary)] capitalize">{MESES[calMonth.m]} {calMonth.y}</span>
                <button onClick={() => setCalMonth(c => c.m === 11 ? {y:c.y+1,m:0} : {y:c.y,m:c.m+1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DIAS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-[var(--color-text-muted)] py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} />
                  const mm = String(calMonth.m+1).padStart(2,'0'), dd = String(d).padStart(2,'0')
                  const thisStr = `${calMonth.y}-${mm}-${dd}`
                  const isSel = dueDate === thisStr
                  const today = new Date()
                  const isToday = today.getFullYear()===calMonth.y && today.getMonth()===calMonth.m && today.getDate()===d
                  const isPast  = new Date(thisStr+'T23:59:59') < today
                  return <button key={i} onClick={() => pick(d)}
                    className={`h-8 rounded-lg text-sm transition-colors ${isSel ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] font-semibold' : isToday ? 'ring-1 ring-[var(--color-brand)] font-bold text-[var(--color-text-primary)]' : isPast ? 'text-[var(--color-text-faint)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]'}`}>{d}</button>
                })}
              </div>
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block">Data</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-brand)]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block">Hora</label>
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="w-24 border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-brand)]" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowDatePicker(false)} className="w-full py-2 text-sm font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Confirmar</button>
                {dueDate && <button onClick={() => { setDueDate(''); setDueTime(''); setShowDatePicker(false) }} className="w-full py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">Remover data</button>}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
