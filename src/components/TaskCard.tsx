'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { logActivity } from '@/lib/activity'
import { useToast } from '@/lib/ToastContext'
import { useMentions } from '@/lib/useMentions'
import { ensureWatching, ensureWatchingFromMentions } from '@/lib/watch'
import { autoGrow } from '@/lib/autoGrow'
import EditableField from '@/components/EditableField'
import ModalPortal from '@/components/ModalPortal'
import WatchButton from '@/components/WatchButton'
import PropertyPill, { pillSelectCls } from '@/components/PropertyPill'
import { X, Calendar, ChevronDown, Send, Pencil, Trash2, Check, Link2 } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'tarefa',   label: 'Tarefa',   color: '#3B82F6' },
  { value: 'lembrete', label: 'Lembrete', color: '#F59E0B' },
  { value: 'nota',     label: 'Nota',     color: '#8B5CF6' },
]
const STATUS_OPTIONS = [
  { value: 'a_fazer', label: 'A fazer', color: '#6B7280' },
  { value: 'fazendo',  label: 'Fazendo', color: '#F59E0B' },
  { value: 'feito',    label: 'Feito',    color: '#22C55E' },
]

function initials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

type Props = {
  taskId?: string
  defaultAssignedTo?: string
  defaultStatus?: string
  clients?: any[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: (id: string) => void
}

export default function TaskCard({ taskId, defaultAssignedTo, defaultStatus, clients = [], onClose, onSaved, onDeleted }: Props) {
  const { members, currentMember } = useUser()
  const who = currentMember?.name || 'Alguém'
  const { toast } = useToast()
  const supabase = createClient()
  const titleOriginal = useRef<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [mobilePane, setMobilePane] = useState<'details' | 'comments'>('details')
  const [activityKey, setActivityKey] = useState(0)
  const [activities, setActivities] = useState<{ id: string; action: string; actor_name: string | null; description: string; created_at: string }[]>([])

  const [loading, setLoading] = useState(!!taskId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [id, setId] = useState<string | undefined>(taskId)
  const [linkCopied, setLinkCopied] = useState(false)

  const [title, setTitle] = useState('')
  const [type, setType] = useState('tarefa')
  const [status, setStatus] = useState(defaultStatus || 'a_fazer')
  const [clientId, setClientId] = useState('')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(defaultAssignedTo || currentMember?.id || '')
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [createdByName, setCreatedByName] = useState<string | null>(null)

  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const mentions = useMentions(newComment, setNewComment, members)

  useEffect(() => {
    const rid = id || taskId
    if (!rid) { setActivities([]); return }
    supabase.from('activity_log').select('id, action, actor_name, description, created_at')
      .eq('table_name', 'personal_tasks').eq('record_id', rid).order('created_at', { ascending: false })
      .then(({ data }) => setActivities(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, taskId, activityKey])

  const loadComments = useCallback(async (tid: string) => {
    const { data } = await supabase.from('personal_task_comments').select('*').eq('task_id', tid).order('created_at', { ascending: true })
    setComments(data || [])
  }, [])

  useEffect(() => {
    if (!taskId) return
    async function load() {
      const { data } = await supabase.from('personal_tasks').select('*').eq('id', taskId).single()
      if (data) {
        setTitle(data.title || '')
        setType(data.type || 'tarefa')
        setStatus(data.status || 'a_fazer')
        setClientId(data.client_id || '')
        setNote(data.note || '')
        setDueDate(data.due_date || '')
        setAssignedTo(data.assigned_to || '')
        setCreatedAt(data.created_at || null)
        if (data.created_by) {
          const creator = members.find((m: any) => m.id === data.created_by)
          setCreatedByName(creator?.name || null)
        }
      }
      await loadComments(taskId)
      setLoading(false)
    }
    load()
  }, [taskId, loadComments, members])

  async function ensureId(): Promise<string | undefined> {
    if (id) return id
    if (!title.trim()) return undefined
    const payload = {
      title, type, status, note,
      client_id: clientId || null,
      assigned_to: assignedTo,
      created_by: currentMember?.id || null,
      due_date: dueDate || null,
    }
    const { data } = await supabase.from('personal_tasks').insert(payload).select().single()
    if (data) {
      setId(data.id)
      ensureWatching('personal_tasks', data.id, [currentMember?.id, assignedTo])
      await logActivity({ tableName: 'personal_tasks', recordId: data.id, action: 'created', actorName: currentMember?.name, actorId: currentMember?.id, description: `${currentMember?.name || 'Alguém'} criou "${title}"` })
      setActivityKey(k => k + 1)
      return data.id
    }
    return undefined
  }

  async function persist(patch: Record<string, any>, logMsg?: string, action = 'updated'): Promise<string | undefined> {
    const tid = await ensureId()
    if (!tid) return undefined
    const { error } = await supabase.from('personal_tasks').update(patch).eq('id', tid)
    if (error) { toast('Erro ao salvar'); return undefined }
    if (logMsg) {
      await logActivity({ tableName: 'personal_tasks', recordId: tid, action, actorName: currentMember?.name, actorId: currentMember?.id, description: logMsg })
      setActivityKey(k => k + 1)
    }
    onSaved()
    return tid
  }

  const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]))
  function changeStatus(v: string) {
    const old = STATUS_LABEL[status] || status
    setStatus(v)
    const completedPatch = v === 'feito' ? { completed_at: new Date().toISOString() } : { completed_at: null }
    persist({ status: v, ...completedPatch }, `${who} moveu de "${old}" para "${STATUS_LABEL[v] || v}"`, 'status_changed')
  }
  function changeType(v: string) {
    setType(v)
    persist({ type: v }, `${who} mudou o tipo para "${TYPE_OPTIONS.find(t => t.value === v)?.label || v}"`)
  }
  function changeClient(v: string) {
    setClientId(v)
    const name = v ? (clients.find(c => c.id === v)?.name || '') : 'sem cliente'
    persist({ client_id: v || null }, `${who} definiu o cliente: ${name}`)
  }
  function changeAssignedTo(v: string) {
    setAssignedTo(v)
    const name = members.find((m: any) => m.id === v)?.name || 'alguém'
    persist({ assigned_to: v }, `${who} atribuiu essa tarefa pra ${name}`, 'member_assigned')
    if (id) ensureWatching('personal_tasks', id, [v])
  }

  async function handleDelete() {
    if (!id) { onClose(); return }
    await supabase.from('personal_tasks').delete().eq('id', id)
    onDeleted?.(id)
    onClose()
  }

  async function addComment() {
    if (!newComment.trim()) return
    const tid = await ensureId()
    if (!tid) return
    const author = currentMember?.name || 'Você'
    const { data } = await supabase.from('personal_task_comments').insert({ task_id: tid, body: newComment, author_name: author }).select().single()
    if (data) setComments(c => [...c, data])
    const body = newComment
    setNewComment('')
    requestAnimationFrame(() => { if (mentions.textareaRef.current) autoGrow(mentions.textareaRef.current) })
    await ensureWatchingFromMentions('personal_tasks', tid, body, members)
    await logActivity({ tableName: 'personal_tasks', recordId: tid, action: 'commented', actorName: author, description: `${author} comentou: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"` })
    setActivityKey(k => k + 1)
  }
  async function saveEditComment(cid: string) {
    const body = editCommentText.trim(); if (!body) return
    const { error } = await supabase.from('personal_task_comments').update({ body }).eq('id', cid)
    if (!error) setComments(cs => cs.map(c => c.id === cid ? { ...c, body } : c))
    setEditingCommentId(null)
  }
  async function deleteComment(cid: string) {
    const prev = comments
    setComments(cs => cs.filter(c => c.id !== cid))
    const { error } = await supabase.from('personal_task_comments').delete().eq('id', cid)
    if (error) setComments(prev)
  }

  const clientName = clients.find(c => c.id === clientId)?.name
  const typeObj = TYPE_OPTIONS.find(t => t.value === type)
  const statusObj = STATUS_OPTIONS.find(s => s.value === status)

  if (loading) return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
        <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
      </div>
    </ModalPortal>
  )

  const fullDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  type FeedItem =
    | { kind: 'comment'; id: string; cid: string; at: string; author: string | null; body: string }
    | { kind: 'activity'; id: string; at: string; author: string | null; body: string }
  const feed: FeedItem[] = [
    ...comments.map(c => ({ kind: 'comment' as const, id: 'c' + c.id, cid: c.id, at: c.created_at, author: c.author_name, body: c.body })),
    ...activities.map(a => ({ kind: 'activity' as const, id: 'a' + a.id, at: a.created_at, author: a.actor_name, body: a.description })),
    ...(createdAt && !activities.some(a => a.action === 'created')
      ? [{ kind: 'activity' as const, id: '__created__', at: createdAt, author: createdByName, body: 'Card criado' }]
      : []),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
  const isImportantActivity = (f: FeedItem) => f.id === '__created__' || /atribu|status/i.test(f.body)
  const visibleFeed = showDetails ? feed : feed.filter(f => f.kind === 'comment' || isImportantActivity(f))

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center md:py-6 md:px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[var(--color-bg-alt)] rounded-none md:rounded-2xl w-full h-full md:h-auto max-w-[880px] max-h-full md:max-h-[88vh] flex flex-col shadow-pop overflow-hidden animate-scale-in"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        <div className="md:hidden flex items-center border-b border-[var(--color-border)] bg-[var(--color-bg-card)] flex-shrink-0">
          <button onClick={() => setMobilePane('details')} className="flex-1 text-center py-2.5 text-sm font-semibold relative"
            style={{ color: mobilePane === 'details' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            Detalhes
            {mobilePane === 'details' && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: 'var(--color-accent)' }} />}
          </button>
          <button onClick={() => setMobilePane('comments')} className="flex-1 text-center py-2.5 text-sm font-semibold relative"
            style={{ color: mobilePane === 'comments' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            Comentários
            {mobilePane === 'comments' && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: 'var(--color-accent)' }} />}
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
        <div className={`${mobilePane === 'comments' ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 flex-col overflow-hidden`}>

        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 px-4 md:px-7 pt-4 pb-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            <input value={title}
              onFocus={() => { if (titleOriginal.current === null) titleOriginal.current = title }}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => {
                const orig = titleOriginal.current
                titleOriginal.current = null
                if (orig === null || orig === title || !title.trim()) return
                if (!id) persist({ title })
                else persist({ title }, `${who} renomeou "${orig}" para "${title}"`)
              }}
              placeholder="Nome da tarefa…"
              className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder-[var(--color-text-faint)] leading-tight" />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {clientName ? <>em <span className="font-semibold text-[var(--color-text-secondary)]">{clientName}</span></> : 'sem cliente'}
              {createdByName && createdByName !== members.find((m: any) => m.id === assignedTo)?.name && (
                <><span className="mx-1.5 text-[var(--color-text-faint)]">·</span>adicionado por {createdByName}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {id && (
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/dashboard/tarefas?task=${id}`)
                setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000)
              }} title="Copiar link do card"
                className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-colors"
                style={{ color: linkCopied ? 'var(--ds-success-text)' : 'var(--color-text-secondary)' }}>
                {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* PROPRIEDADES */}
        <div className="px-4 md:px-7 py-2.5 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
            <PropertyPill label="Tipo">
              <div className="relative min-w-0">
                <select value={type} onChange={e => changeType(e.target.value)}
                  className={pillSelectCls} style={{ background: (typeObj?.color || '#6b7280') + '18', color: typeObj?.color || '#6b7280', borderColor: (typeObj?.color || '#6b7280') + '44' }}>
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value} style={{ color: 'var(--color-text-primary)' }}>{t.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: typeObj?.color || '#6b7280' }} />
              </div>
            </PropertyPill>
            <PropertyPill label="Status">
              <div className="relative min-w-0">
                <select value={status} onChange={e => changeStatus(e.target.value)}
                  className={pillSelectCls} style={{ background: (statusObj?.color || '#6b7280') + '18', color: statusObj?.color || '#6b7280', borderColor: (statusObj?.color || '#6b7280') + '44' }}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--color-text-primary)' }}>{s.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: statusObj?.color || '#6b7280' }} />
              </div>
            </PropertyPill>
            <PropertyPill label="Cliente">
              <div className="relative min-w-0">
                <select value={clientId} onChange={e => changeClient(e.target.value)}
                  className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: clientId ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  <option value="">Sem cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </PropertyPill>
            <PropertyPill label="Responsável">
              <div className="relative min-w-0">
                <select value={assignedTo} onChange={e => changeAssignedTo(e.target.value)}
                  className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: 'var(--color-text-primary)' }}>
                  {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </PropertyPill>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Calendar size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
            <input type="date" value={dueDate}
              onChange={e => { setDueDate(e.target.value); persist({ due_date: e.target.value || null }, e.target.value ? `${who} definiu o prazo` : `${who} removeu o prazo`) }}
              className="text-xs font-medium bg-transparent outline-none text-[var(--color-text-secondary)]" />
          </div>
        </div>

        {/* CONTEÚDO */}
        <div className="flex-1 min-w-0 flex flex-col gap-5 overflow-y-auto px-4 md:px-7 py-5">
          <EditableField
            label="Nota" hint="· detalhes, contexto, checklist em texto"
            placeholder="Detalhes da tarefa, contexto, o que precisa ser feito…"
            value={note} minH={120}
            onCommit={v => { const hadId = !!id; setNote(v); persist({ note: v }, hadId ? `${who} editou a nota` : undefined) }}
          />

          {id && (
            <button onClick={() => setConfirmDelete(true)}
              className="self-start flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)] transition-colors">
              <Trash2 size={12} /> Excluir tarefa
            </button>
          )}
          {confirmDelete && (
            <div className="rounded-xl border p-3 flex items-center gap-3 text-xs" style={{ borderColor: 'var(--ds-error-border)', background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)' }}>
              <span className="flex-1">Excluir essa tarefa? Não tem como desfazer.</span>
              <button onClick={handleDelete} className="font-semibold px-2.5 py-1 rounded-lg bg-[var(--ds-error-accent)] text-white">Excluir</button>
              <button onClick={() => setConfirmDelete(false)} className="font-semibold px-2.5 py-1 rounded-lg">Cancelar</button>
            </div>
          )}
        </div>
        </div>

        {/* SIDEBAR — comentários + atividade */}
        <div className={`${mobilePane === 'details' ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] flex-1 md:flex-none bg-[var(--color-bg-card)] flex-col overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <span className="text-xs font-bold text-[var(--color-text-primary)]">Comentários e atividade</span>
            <div className="flex items-center gap-2">
              <WatchButton tableName="personal_tasks" recordId={id} />
              <button onClick={() => setShowDetails(v => !v)} className="text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                {showDetails ? 'Ocultar detalhes' : 'Mostrar detalhes'}
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: (currentMember as any)?.color || 'var(--color-brand)' }}>
              {(currentMember?.name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <textarea ref={mentions.textareaRef} value={newComment} onChange={mentions.handleChange}
                onInput={e => autoGrow(e.currentTarget)}
                onKeyDown={e => { if (mentions.handleKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
                onBlur={mentions.handleBlur}
                placeholder="Escrever um comentário… @ para mencionar" rows={3}
                className="w-full bg-[var(--color-bg-page)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none resize-none focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-card)] transition-colors" />
              {mentions.dropdown}
              <div className="flex justify-end mt-2">
                <button onClick={addComment} disabled={!newComment.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40 enabled:hover:opacity-90 transition-opacity flex-shrink-0"
                  style={{ background: 'var(--color-accent)' }}>
                  <Send size={12} /> Comentar
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {visibleFeed.length === 0 ? (
              <p className="text-xs text-[var(--color-text-faint)] text-center py-8">Nada ainda.</p>
            ) : visibleFeed.map(item => {
              const memberMatch = item.author ? members.find((x: any) => x.name === item.author) : null
              const av = { initials: item.author ? initials(item.author) : '?', color: (memberMatch as any)?.color || '#9ca3af' }
              return item.kind === 'comment' ? (
                <div key={item.id} className="flex items-start gap-2.5 group">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: av.color }}>{av.initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{item.author || 'Alguém'}</span>
                      <span className="text-[10px] text-[var(--color-text-faint)]" title={fullDateTime(item.at)}>{fullDateTime(item.at)}</span>
                      {editingCommentId !== item.cid && (
                        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingCommentId(item.cid); setEditCommentText(item.body) }} title="Editar"
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-page)] transition-colors"><Pencil size={11} /></button>
                          <button onClick={() => deleteComment(item.cid)} title="Excluir"
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)] hover:bg-[var(--color-bg-page)] transition-colors"><Trash2 size={11} /></button>
                        </div>
                      )}
                    </div>
                    {editingCommentId === item.cid ? (
                      <div>
                        <textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} rows={2}
                          className="w-full bg-[var(--color-bg-page)] border border-[var(--color-accent)] rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none" />
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => saveEditComment(item.cid)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white" style={{ background: 'var(--color-accent)' }}>Salvar</button>
                          <button onClick={() => setEditingCommentId(null)} className="text-[11px] px-2.5 py-1 rounded-lg text-[var(--color-text-secondary)]">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">{item.body}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div key={item.id} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-[var(--color-bg-subtle)] text-[var(--color-text-faint)] text-[10px]">•</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{item.body}</p>
                    <span className="text-[10px] text-[var(--color-text-faint)]">{fullDateTime(item.at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
